import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import path from "node:path";
import JSZip from "jszip";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import type {
  BoardComment,
  CanvasObjectPayload,
  CanvasOperation,
  ChatMessage,
  CursorPayload,
  IntegrationStatus,
  Participant
} from "../../shared/src/types";
import { boardTemplates } from "../../shared/src/templates";
import {
  addAnalysis,
  addChatMessage,
  addComment,
  applyCanvasOperation,
  configureBoardPersistence,
  duplicateBoard,
  formatSessionSummaryMarkdown,
  getBoardPersistenceStatus,
  getOrCreateRoom,
  getQualityReport,
  getRoomObjects,
  getRoomVersions,
  getSessionSummary,
  joinParticipant,
  listBoardSnapshots,
  listBoardSummaries,
  listComments,
  removeParticipant,
  restoreRoomVersion,
  roomExists,
  serializeRoom,
  updateComment,
  updateBoardMetadata,
  updateParticipant
} from "./boardStore";
import { analyzeCanvasWithGroq, answerChatWithGroq } from "./ai/groqAnalyzer";
import { analyzeCanvas, answerChat } from "./ai/mockAnalyzer";
import { analyzeCanvasWithAnthropic, answerChatWithAnthropic } from "./ai/anthropicAnalyzer";
import { enforceAiRateLimit, moderateImageDataUrl, moderateText } from "./ai/guardrails";
import { createBoardPersistenceFromEnv } from "./storage/boardPersistence";
import { createObjectStorageFromEnv } from "./storage/objectStorage";
import { createPresenceStoreFromEnv } from "./storage/presenceStore";
import {
  authConfig,
  authStatus,
  canAccessBoard,
  inviteSecretAllows,
  issueUserTokens,
  issueGuestToken,
  principalFromRequest,
  principalFromSocket,
  requireHttpAction,
  sanitizeParticipantForPrincipal,
  type BoardAction
} from "./auth/authorization";
import { exchangeOAuthCode, oauthStartUrl, supportedOAuthProvider } from "./auth/oauth";
import { authStore, configureAuthStoreFromEnv } from "./auth/userStore";
import { CanvasLmsClient, GoogleClassroomClient, MoodleClient } from "./integrations/clients";
import { billingStatus, createBillingPortalSession, createCheckoutSession } from "./billing/stripeClient";
import { metricsMiddleware, metricsText } from "./monitoring";

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:5173";
const aiProvider = process.env.AI_PROVIDER ?? "mock";
const objectStorage = createObjectStorageFromEnv();
const boardPersistence = createBoardPersistenceFromEnv(objectStorage);
const presenceStore = createPresenceStoreFromEnv();

await configureBoardPersistence(boardPersistence);
await configureAuthStoreFromEnv();
await presenceStore.initialize();

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    credentials: true
  }
});

io.use((socket, next) => {
  const principal = principalFromSocket(socket);

  if (authConfig.required && !principal) {
    next(new Error("Authentication required"));
    return;
  }

  socket.data.principal = principal;
  next();
});

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(metricsMiddleware);

const objectSchema = z.record(z.unknown()).and(z.object({ objectId: z.string().min(1) }));
const commentSchema = z.object({
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  body: z.string().min(1).max(1000),
  anchor: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().min(1),
    height: z.number().min(1)
  })
});

async function participantsForRoom(roomId: string, fallback: Participant[]) {
  if (presenceStore.status.name !== "redis") {
    return fallback;
  }

  try {
    const redisParticipants = await presenceStore.listParticipants(roomId);
    return redisParticipants.length > 0 ? redisParticipants : fallback;
  } catch (error) {
    console.error(`Failed to load Redis presence for ${roomId}`, error);
    return fallback;
  }
}

async function serializeRoomWithPresence(roomId: string) {
  const snapshot = serializeRoom(getOrCreateRoom(roomId));
  return {
    ...snapshot,
    participants: await participantsForRoom(roomId, snapshot.participants)
  };
}

async function emitParticipants(roomId: string) {
  const snapshot = serializeRoom(getOrCreateRoom(roomId));
  io.to(roomId).emit("participants-updated", await participantsForRoom(roomId, snapshot.participants));
}

async function emitBoardState(roomId: string) {
  io.to(roomId).emit("board-state", await serializeRoomWithPresence(roomId));
}

function socketCan(socket: Socket, roomId: string | undefined, action: BoardAction) {
  const principal = socket.data.principal ?? null;
  return canAccessBoard(principal, roomId, action);
}

function rejectSocketAction(socket: Socket, action: BoardAction) {
  socket.emit("toast", action === "read" ? "Authentication required" : "You do not have permission for that action");
}

function integrationStatuses(): IntegrationStatus[] {
  return [
    {
      id: "canvas-lms",
      name: "Canvas LMS",
      configured: Boolean(process.env.CANVAS_LMS_BASE_URL && process.env.CANVAS_LMS_TOKEN),
      status: process.env.CANVAS_LMS_BASE_URL && process.env.CANVAS_LMS_TOKEN ? "ready" : "stub",
      description: "Phase 3 boundary for exporting board summaries to Canvas assignments."
    },
    {
      id: "moodle",
      name: "Moodle",
      configured: Boolean(process.env.MOODLE_BASE_URL && process.env.MOODLE_TOKEN),
      status: process.env.MOODLE_BASE_URL && process.env.MOODLE_TOKEN ? "ready" : "stub",
      description: "Phase 3 boundary for exporting board summaries to Moodle activities."
    },
    {
      id: "google-classroom",
      name: "Google Classroom",
      configured: Boolean(process.env.GOOGLE_CLASSROOM_ACCESS_TOKEN),
      status: process.env.GOOGLE_CLASSROOM_ACCESS_TOKEN ? "ready" : "stub",
      description: "Phase 3 boundary for roster and coursework sync."
    },
    {
      id: "slack",
      name: "Slack",
      configured: Boolean(process.env.SLACK_WEBHOOK_URL),
      status: process.env.SLACK_WEBHOOK_URL ? "ready" : "missing-config",
      description: "Shares session summary links or text to a Slack incoming webhook."
    }
  ];
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function postSlackSnapshot(text: string, imageDataUrl?: string) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!imageDataUrl || !botToken || !channelId) {
    return null;
  }

  const decoded = decodeDataUrl(imageDataUrl);
  const form = new FormData();
  form.append("channels", channelId);
  form.append("initial_comment", text);
  form.append("filename", "whiteboard-snapshot.png");
  form.append("file", new Blob([decoded.buffer], { type: decoded.mimeType }), "whiteboard-snapshot.png");

  const response = await fetch("https://slack.com/api/files.upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`
    },
    body: form
  });
  const payload = (await response.json()) as { ok?: boolean; error?: string };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Slack file upload failed with ${response.status}`);
  }

  return payload;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "daedalus-whiteboard-api",
    aiProvider,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    storage: {
      boards: getBoardPersistenceStatus(),
      presence: presenceStore.status,
      objects: objectStorage.status
    },
    collaboration: {
      model: "yjs-server-crdt",
      reconnectReplay: true
    },
    auth: authStatus(),
    billing: billingStatus()
  });
});

app.get("/metrics", (_request, response) => {
  response.type("text/plain").send(metricsText());
});

app.get("/api/templates", (_request, response) => {
  response.json(boardTemplates);
});

app.post("/api/auth/register", async (request, response) => {
  const parsed = z
    .object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      password: z.string().min(12).max(256),
      role: z.enum(["owner", "instructor"]).default("owner")
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.role === "instructor" && !inviteSecretAllows(request)) {
    response.status(403).json({ error: "Instructor registration requires invite authorization" });
    return;
  }

  try {
    const user = await authStore.createPasswordUser(parsed.data);
    response.status(201).json(await issueUserTokens(user));
  } catch (error) {
    response.status(409).json({ error: error instanceof Error ? error.message : "Registration failed" });
  }
});

app.post("/api/auth/login", async (request, response) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(1)
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await authStore.verifyPassword(parsed.data.email, parsed.data.password);
  if (!user) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }

  response.json(await issueUserTokens(user));
});

app.post("/api/auth/refresh", async (request, response) => {
  const parsed = z
    .object({
      refreshToken: z.string().min(1)
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await authStore.consumeRefreshToken(parsed.data.refreshToken);
  if (!user) {
    response.status(401).json({ error: "Refresh token is invalid or expired" });
    return;
  }

  response.json(await issueUserTokens(user));
});

app.get("/api/auth/me", (request, response) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  response.json({
    id: principal.sub,
    email: principal.email,
    name: principal.name,
    role: principal.role,
    type: principal.type
  });
});

app.post("/api/billing/checkout", async (request, response) => {
  const principal = principalFromRequest(request);

  if (!principal || principal.type !== "user") {
    response.status(401).json({ error: "User authentication required" });
    return;
  }

  const parsed = z
    .object({
      priceId: z.string().min(1).optional(),
      successUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const priceId = parsed.data.priceId ?? process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    response.status(400).json({ error: "Stripe price ID is not configured" });
    return;
  }

  try {
    response.json(
      await createCheckoutSession({
        userId: principal.sub,
        email: principal.email,
        priceId,
        successUrl: parsed.data.successUrl ?? `${clientOrigin}/billing/success`,
        cancelUrl: parsed.data.cancelUrl ?? `${clientOrigin}/billing/cancel`
      })
    );
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Stripe checkout failed" });
  }
});

app.post("/api/billing/portal", async (request, response) => {
  const principal = principalFromRequest(request);

  if (!principal || principal.type !== "user") {
    response.status(401).json({ error: "User authentication required" });
    return;
  }

  const parsed = z
    .object({
      customerId: z.string().min(1),
      returnUrl: z.string().url().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    response.json(
      await createBillingPortalSession({
        customerId: parsed.data.customerId,
        returnUrl: parsed.data.returnUrl ?? clientOrigin
      })
    );
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Stripe portal failed" });
  }
});

const oauthStates = new Set<string>();

app.get("/api/auth/oauth/:provider/start", (request, response) => {
  if (!supportedOAuthProvider(request.params.provider)) {
    response.status(404).json({ error: "Unsupported OAuth provider" });
    return;
  }

  try {
    const state = crypto.randomUUID();
    oauthStates.add(state);
    const url = oauthStartUrl(request.params.provider, state);

    if (request.query.redirect === "1") {
      response.redirect(url);
      return;
    }

    response.json({ url, state });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "OAuth provider is not configured" });
  }
});

app.get("/api/auth/oauth/:provider/callback", async (request, response) => {
  if (!supportedOAuthProvider(request.params.provider)) {
    response.status(404).json({ error: "Unsupported OAuth provider" });
    return;
  }

  const code = typeof request.query.code === "string" ? request.query.code : undefined;
  const state = typeof request.query.state === "string" ? request.query.state : undefined;

  if (!code || !state || !oauthStates.has(state)) {
    response.status(400).json({ error: "Invalid OAuth callback state" });
    return;
  }

  oauthStates.delete(state);

  try {
    const profile = await exchangeOAuthCode(request.params.provider, code);
    const user = await authStore.upsertOAuthUser(profile);
    response.json(await issueUserTokens(user));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "OAuth login failed" });
  }
});

app.post("/api/auth/guest-token", (request, response) => {
  const parsed = z
    .object({
      roomId: z.string().min(1),
      name: z.string().min(1).max(80),
      role: z.enum(["viewer", "editor"]).default("editor")
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const principal = principalFromRequest(request);
  const canManage = canAccessBoard(principal, parsed.data.roomId, "manage");

  if (!canManage && !inviteSecretAllows(request)) {
    response.status(principal ? 403 : 401).json({ error: principal ? "Forbidden" : "Authentication required" });
    return;
  }

  response.status(201).json({
    token: issueGuestToken(parsed.data),
    expiresInSeconds: authConfig.guestTokenTtlSeconds
  });
});

app.post("/api/boards/:roomId/share", async (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "manage")) {
    return;
  }

  const parsed = z
    .object({
      email: z.string().email().optional(),
      userId: z.string().min(1).optional(),
      role: z.enum(["viewer", "editor", "owner"]).default("editor")
    })
    .refine((value) => value.email || value.userId, "email or userId is required")
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = parsed.data.userId
    ? authStore.findUser(parsed.data.userId)
    : parsed.data.email
      ? authStore.findUserByEmail(parsed.data.email)
      : null;

  if (!user) {
    response.status(404).json({ error: "User account not found" });
    return;
  }

  response.status(201).json(await authStore.grantBoard(request.params.roomId, user.id, parsed.data.role));
});

app.get("/api/integrations", (_request, response) => {
  response.json(integrationStatuses());
});

app.get("/api/integrations/canvas/courses/:courseId/roster", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  try {
    response.json(await new CanvasLmsClient().roster(request.params.courseId));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Canvas LMS roster sync failed" });
  }
});

app.post("/api/integrations/canvas/courses/:courseId/assignments/:assignmentId/submissions", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  const classroomId = typeof request.body?.classroomId === "string" ? request.body.classroomId : undefined;

  try {
    const payload = await new CanvasLmsClient().submitSummary(
      request.params.courseId,
      request.params.assignmentId,
      getSessionSummary(classroomId)
    );
    response.json({ submitted: true, payload });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Canvas LMS submission failed" });
  }
});

app.get("/api/integrations/moodle/courses/:courseId/roster", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  try {
    response.json(await new MoodleClient().roster(request.params.courseId));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Moodle roster sync failed" });
  }
});

app.post("/api/integrations/moodle/assignments/:assignmentId/submissions", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  const classroomId = typeof request.body?.classroomId === "string" ? request.body.classroomId : undefined;

  try {
    const payload = await new MoodleClient().submitSummary(request.params.assignmentId, getSessionSummary(classroomId));
    response.json({ submitted: true, payload });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Moodle submission failed" });
  }
});

app.get("/api/integrations/google-classroom/courses/:courseId/roster", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  try {
    response.json(await new GoogleClassroomClient().roster(request.params.courseId));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Google Classroom roster sync failed" });
  }
});

app.get("/api/integrations/google-classroom/courses/:courseId/coursework", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  try {
    response.json(await new GoogleClassroomClient().coursework(request.params.courseId));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Google Classroom coursework sync failed" });
  }
});

app.post("/api/integrations/slack/share", async (request, response) => {
  const parsed = z
    .object({
      classroomId: z.string().optional(),
      roomId: z.string().optional(),
      text: z.string().optional(),
      imageDataUrl: z.string().startsWith("data:image/").optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const actionAllowed = parsed.data.roomId
    ? requireHttpAction(request, response, parsed.data.roomId, "write")
    : requireHttpAction(request, response, undefined, "instructor");
  if (!actionAllowed) {
    return;
  }

  const summary = parsed.data.classroomId ? getSessionSummary(parsed.data.classroomId) : undefined;
  const qualityReport = parsed.data.roomId ? getQualityReport(parsed.data.roomId) : undefined;
  const text =
    parsed.data.text ??
    (summary
      ? `Daedalus session summary: ${summary.boardCount} boards, ${summary.helpRequestedCount} help requests, average quality ${summary.averageQualityScore}.`
      : qualityReport
        ? `Daedalus board quality: ${qualityReport.diagramType}, score ${qualityReport.score}, ${qualityReport.issueCount} issues.`
        : "Daedalus update");
  let fileUpload: unknown = null;

  try {
    fileUpload = await postSlackSnapshot(text, parsed.data.imageDataUrl);
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Slack snapshot upload failed" });
    return;
  }

  if (fileUpload) {
    response.json({
      sent: true,
      mode: "file-upload",
      preview: { text }
    });
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    response.status(202).json({
      sent: false,
      reason: "Slack webhook or bot upload credentials are not configured",
      preview: { text }
    });
    return;
  }

  const slackResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  response.status(slackResponse.ok ? 200 : 502).json({
    sent: slackResponse.ok,
    status: slackResponse.status,
    preview: { text }
  });
});

async function analyzeBoard(roomId: string, objects: CanvasObjectPayload[], imageDataUrl?: string) {
  enforceAiRateLimit(roomId);
  moderateImageDataUrl(imageDataUrl);

  if (aiProvider === "anthropic" && process.env.ANTHROPIC_API_KEY && imageDataUrl) {
    const analysis = await analyzeCanvasWithAnthropic(roomId, objects, imageDataUrl);
    moderateText(`${analysis.summary} ${analysis.hints.join(" ")} ${analysis.issues.map((issue) => `${issue.title} ${issue.explanation}`).join(" ")}`);
    return analysis;
  }

  if (aiProvider === "groq" && process.env.GROQ_API_KEY && imageDataUrl) {
    const analysis = await analyzeCanvasWithGroq(roomId, objects, imageDataUrl);
    moderateText(`${analysis.summary} ${analysis.hints.join(" ")} ${analysis.issues.map((issue) => `${issue.title} ${issue.explanation}`).join(" ")}`);
    return analysis;
  }

  const analysis = analyzeCanvas(roomId, objects);
  moderateText(analysis.summary);
  return analysis;
}

async function answerBoardChat(
  roomId: string,
  authorName: string,
  prompt: string,
  objects: CanvasObjectPayload[],
  imageDataUrl?: string
) {
  enforceAiRateLimit(`${roomId}:chat`);
  moderateText(prompt);
  moderateImageDataUrl(imageDataUrl);

  if (aiProvider === "anthropic" && process.env.ANTHROPIC_API_KEY && imageDataUrl) {
    const message = await answerChatWithAnthropic(roomId, authorName, prompt, objects, imageDataUrl);
    moderateText(message.content);
    return message;
  }

  if (aiProvider === "groq" && process.env.GROQ_API_KEY && imageDataUrl) {
    const message = await answerChatWithGroq(roomId, authorName, prompt, objects, imageDataUrl);
    moderateText(message.content);
    return message;
  }

  const message = answerChat(roomId, authorName, prompt, objects);
  moderateText(message.content);
  return message;
}

app.post("/api/ai/analyze", async (request, response) => {
  const parsed = z
    .object({
      roomId: z.string().min(1),
      objects: z.array(objectSchema).default([]),
      imageDataUrl: z.string().startsWith("data:image/").optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!requireHttpAction(request, response, parsed.data.roomId, "write")) {
    return;
  }

  try {
    const analysis = addAnalysis(
      parsed.data.roomId,
      await analyzeBoard(parsed.data.roomId, parsed.data.objects as CanvasObjectPayload[], parsed.data.imageDataUrl)
    );
    io.to(parsed.data.roomId).emit("ai-analysis", analysis);
    response.json(analysis);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "AI analysis failed"
    });
  }
});

app.post("/api/ai/analyze/stream", async (request, response) => {
  const parsed = z
    .object({
      roomId: z.string().min(1),
      objects: z.array(objectSchema).default([]),
      imageDataUrl: z.string().startsWith("data:image/").optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!requireHttpAction(request, response, parsed.data.roomId, "write")) {
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  response.write(`event: status\ndata: ${JSON.stringify({ status: "started" })}\n\n`);

  try {
    const analysis = addAnalysis(
      parsed.data.roomId,
      await analyzeBoard(parsed.data.roomId, parsed.data.objects as CanvasObjectPayload[], parsed.data.imageDataUrl)
    );
    io.to(parsed.data.roomId).emit("ai-analysis", analysis);
    response.write(`event: analysis\ndata: ${JSON.stringify(analysis)}\n\n`);
  } catch (error) {
    response.write(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "AI analysis failed" })}\n\n`);
  } finally {
    response.end();
  }
});

app.get("/api/boards", async (request, response) => {
  const classroomId = typeof request.query.classroomId === "string" ? request.query.classroomId : undefined;

  const principal = principalFromRequest(request);

  if (authConfig.required && !principal) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const accessibleRooms =
    authConfig.required && principal?.role !== "instructor" ? new Set(authStore.accessibleRoomIds(principal?.sub ?? "")) : null;
  const summaries = listBoardSummaries(classroomId).filter((summary) => !accessibleRooms || accessibleRooms.has(summary.roomId));

  if (presenceStore.status.name !== "redis") {
    response.json(summaries);
    return;
  }

  response.json(
    await Promise.all(
      summaries.map(async (summary) => ({
        ...summary,
        participantCount: (await participantsForRoom(summary.roomId, [])).length
      }))
    )
  );
});

app.get("/api/boards/:roomId", async (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "read")) {
    return;
  }

  response.json(await serializeRoomWithPresence(request.params.roomId));
});

app.get("/api/boards/:roomId/quality-report", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "read")) {
    return;
  }

  response.json(getQualityReport(request.params.roomId));
});

app.get("/api/boards/:roomId/comments", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "read")) {
    return;
  }

  response.json(listComments(request.params.roomId));
});

app.post("/api/boards/:roomId/comments", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "comment")) {
    return;
  }

  const parsed = commentSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const comment = addComment(request.params.roomId, parsed.data);
  io.to(request.params.roomId).emit("comments-updated", listComments(request.params.roomId));
  response.status(201).json(comment);
});

app.patch("/api/boards/:roomId/comments/:commentId", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "comment")) {
    return;
  }

  const parsed = z
    .object({
      body: z.string().min(1).max(1000).optional(),
      resolved: z.boolean().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const comment = updateComment(request.params.roomId, request.params.commentId, parsed.data);

  if (!comment) {
    response.status(404).json({ error: "Comment not found" });
    return;
  }

  io.to(request.params.roomId).emit("comments-updated", listComments(request.params.roomId));
  response.json(comment);
});

app.patch("/api/boards/:roomId", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "write")) {
    return;
  }

  const parsed = z
    .object({
      boardName: z.string().optional(),
      classroomId: z.string().optional(),
      ownerName: z.string().optional(),
      tags: z.array(z.string()).optional(),
      helpRequested: z.boolean().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = updateBoardMetadata(request.params.roomId, parsed.data);
  void emitBoardState(request.params.roomId);
  response.json(snapshot);
});

app.post("/api/boards/:roomId/duplicate", async (request, response) => {
  const principal = requireHttpAction(request, response, request.params.roomId, "read");
  if (!principal) {
    return;
  }

  const parsed = z
    .object({
      roomId: z.string().min(1).optional()
    })
    .safeParse(request.body ?? {});

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const targetRoomId = parsed.data.roomId ?? crypto.randomUUID().slice(0, 8);
  const duplicated = duplicateBoard(request.params.roomId, targetRoomId, principal.name);

  if (!duplicated) {
    response.status(404).json({ error: "Board not found" });
    return;
  }

  if (principal.type === "user") {
    await authStore.grantBoard(targetRoomId, principal.sub, "owner");
  }

  response.status(201).json(duplicated);
});

app.get("/api/boards/:roomId/versions", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "read")) {
    return;
  }

  response.json(getRoomVersions(request.params.roomId));
});

app.get("/api/classrooms/:classroomId/summary", (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);

  if (request.query.format === "markdown") {
    response.type("text/markdown").send(formatSessionSummaryMarkdown(summary));
    return;
  }

  response.json(summary);
});

app.get("/api/classrooms/:classroomId/export-package", async (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);
  const boards = listBoardSnapshots(classroomId);
  const zip = new JSZip();

  zip.file("summary.json", JSON.stringify(summary, null, 2));
  zip.file("summary.md", formatSessionSummaryMarkdown(summary));
  boards.forEach((board) => {
    const folder = zip.folder(`boards/${board.roomId}`);
    folder?.file("board.json", JSON.stringify(board, null, 2));
    folder?.file("objects.json", JSON.stringify(board.objects, null, 2));
    folder?.file("comments.json", JSON.stringify(board.comments, null, 2));
    folder?.file("analyses.json", JSON.stringify(board.analyses, null, 2));
    folder?.file("versions.json", JSON.stringify(board.versions, null, 2));
  });

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  response
    .type("application/zip")
    .setHeader("Content-Disposition", `attachment; filename="${classroomId ?? "all"}-daedalus-export.zip"`)
    .send(buffer);
});

app.post("/api/classrooms/:classroomId/spotlight", (request, response) => {
  if (!requireHttpAction(request, response, undefined, "instructor")) {
    return;
  }

  const parsed = z
    .object({
      roomId: z.string().min(1)
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const target = listBoardSnapshots(classroomId).find((board) => board.roomId === parsed.data.roomId);

  if (!target) {
    response.status(404).json({ error: "Board not found in classroom" });
    return;
  }

  listBoardSnapshots(classroomId).forEach((board) => {
    io.to(board.roomId).emit("spotlight-board", {
      roomId: target.roomId,
      boardName: target.boardName,
      classroomId
    });
  });

  response.json({ spotlighted: true, roomId: target.roomId });
});

app.post("/api/boards/:roomId/restore/:snapshotId", (request, response) => {
  if (!requireHttpAction(request, response, request.params.roomId, "write")) {
    return;
  }

  const parsed = z
    .object({
      userId: z.string().default("system")
    })
    .safeParse(request.body ?? {});

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const operation = restoreRoomVersion(request.params.roomId, request.params.snapshotId, parsed.data.userId);

  if (!operation) {
    response.status(404).json({ error: "Version snapshot not found" });
    return;
  }

  io.to(request.params.roomId).emit("canvas-operation", operation);
  void emitBoardState(request.params.roomId);
  response.json(operation);
});

app.use(express.static(path.resolve("dist/client")));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api") || request.path === "/health" || request.path === "/metrics") {
    next();
    return;
  }

  response.sendFile(path.resolve("dist/client/index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-board", async (payload: { roomId: string; participant: Participant; classroomId?: string; boardName?: string }) => {
    const principal = socket.data.principal ?? null;

    if (authConfig.required && principal?.type === "user" && !roomExists(payload.roomId)) {
      await authStore.grantBoard(payload.roomId, principal.sub, "owner");
    }

    if (!socketCan(socket, payload.roomId, "read")) {
      rejectSocketAction(socket, "read");
      socket.disconnect(true);
      return;
    }

    const participantForRoom = sanitizeParticipantForPrincipal(payload.participant, principal);

    if ((payload.classroomId || payload.boardName) && socketCan(socket, payload.roomId, "write")) {
      updateBoardMetadata(payload.roomId, {
        classroomId: payload.classroomId,
        boardName: payload.boardName,
        ownerName: participantForRoom.name
      });
    }

    const participant = joinParticipant(payload.roomId, participantForRoom);
    socket.join(payload.roomId);
    socket.data.roomId = payload.roomId;
    socket.data.participantId = participant.id;

    await presenceStore.upsertParticipant(payload.roomId, participant);
    socket.emit("board-state", await serializeRoomWithPresence(payload.roomId));
    socket.to(payload.roomId).emit("toast", `${participant.name} joined`);
    await emitParticipants(payload.roomId);
  });

  socket.on("board-meta-update", (patch: { boardName?: string; classroomId?: string; tags?: string[]; helpRequested?: boolean }) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    if (!socketCan(socket, roomId, "write")) {
      rejectSocketAction(socket, "write");
      return;
    }

    updateBoardMetadata(roomId, patch);
    void emitBoardState(roomId);
  });

  socket.on(
    "comment-create",
    (payload: Omit<BoardComment, "id" | "roomId" | "resolved" | "createdAt" | "updatedAt">, ack?: (comment: BoardComment) => void) => {
      const roomId = socket.data.roomId as string | undefined;

      if (!roomId) {
        return;
      }

      if (!socketCan(socket, roomId, "comment")) {
        rejectSocketAction(socket, "comment");
        return;
      }

      const parsed = commentSchema.safeParse(payload);

      if (!parsed.success) {
        return;
      }

      const comment = addComment(roomId, parsed.data);
      io.to(roomId).emit("comments-updated", listComments(roomId));
      ack?.(comment);
    }
  );

  socket.on("comment-update", (payload: { commentId: string; body?: string; resolved?: boolean }) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    if (!socketCan(socket, roomId, "comment")) {
      rejectSocketAction(socket, "comment");
      return;
    }

    updateComment(roomId, payload.commentId, {
      body: payload.body,
      resolved: payload.resolved
    });
    io.to(roomId).emit("comments-updated", listComments(roomId));
  });

  socket.on("participant-update", async (patch: Partial<Participant>) => {
    const roomId = socket.data.roomId as string | undefined;
    const participantId = socket.data.participantId as string | undefined;

    if (!roomId || !participantId) {
      return;
    }

    const safePatch: Partial<Participant> = {};
    if (patch.tool) {
      safePatch.tool = patch.tool;
    }
    if (typeof patch.online === "boolean") {
      safePatch.online = patch.online;
    }
    const participant = updateParticipant(roomId, participantId, safePatch);
    if (participant) {
      await presenceStore.upsertParticipant(roomId, participant);
    } else {
      await presenceStore.updateParticipant(roomId, participantId, safePatch);
    }
    await emitParticipants(roomId);
  });

  socket.on("canvas-operation", (operation: CanvasOperation, ack?: (operation: CanvasOperation) => void) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    if (!socketCan(socket, roomId, "write")) {
      rejectSocketAction(socket, "write");
      return;
    }

    const applied = applyCanvasOperation(roomId, operation);
    if (applied.duplicate) {
      ack?.(applied);
      return;
    }

    socket.to(roomId).emit("canvas-operation", applied);
    void emitBoardState(roomId);
    ack?.(applied);
  });

  socket.on("cursor-update", (cursor: CursorPayload) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    if (!socketCan(socket, roomId, "read")) {
      return;
    }

    socket.to(roomId).emit("cursor-update", cursor);
  });

  socket.on(
    "request-analysis",
    async (payload: { roomId: string; objects?: CanvasObjectPayload[]; imageDataUrl?: string }, ack?: (analysis: unknown) => void) => {
      const roomId = payload.roomId || (socket.data.roomId as string | undefined);

      if (!roomId) {
        return;
      }

      if (!socketCan(socket, roomId, "write")) {
        rejectSocketAction(socket, "write");
        return;
      }

      const objects = payload.objects ?? getRoomObjects(roomId);

      try {
        const analysis = addAnalysis(roomId, await analyzeBoard(roomId, objects, payload.imageDataUrl));
        io.to(roomId).emit("ai-analysis", analysis);
        ack?.(analysis);
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI analysis failed";
        if (/rate limit|moderation|too large/i.test(message)) {
          io.to(roomId).emit("toast", message);
          ack?.(null);
          return;
        }

        const fallback = addAnalysis(roomId, analyzeCanvas(roomId, objects));
        io.to(roomId).emit("toast", `${aiProvider} analysis failed: ${message}`);
        io.to(roomId).emit("ai-analysis", fallback);
        ack?.(fallback);
      }
    }
  );

  socket.on(
    "ai-chat",
    async (
      payload: {
        roomId: string;
        content: string;
        authorName: string;
        objects?: CanvasObjectPayload[];
        imageDataUrl?: string;
      },
      ack?: (message: ChatMessage) => void
    ) => {
      const roomId = payload.roomId || (socket.data.roomId as string | undefined);

      if (!roomId || !payload.content.trim()) {
        return;
      }

      if (!socketCan(socket, roomId, "comment")) {
        rejectSocketAction(socket, "comment");
        return;
      }

      const userMessage = addChatMessage(roomId, {
        id: crypto.randomUUID(),
        roomId,
        sender: "user",
        authorName: payload.authorName,
        content: payload.content.trim(),
        createdAt: new Date().toISOString()
      });
      io.to(roomId).emit("chat-message", userMessage);

      let aiMessage: ChatMessage;

      try {
        aiMessage = addChatMessage(
          roomId,
          await answerBoardChat(roomId, payload.authorName, payload.content, payload.objects ?? getRoomObjects(roomId), payload.imageDataUrl)
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI chat failed";
        if (/rate limit|moderation|too large/i.test(message)) {
          io.to(roomId).emit("toast", message);
          return;
        }

        aiMessage = addChatMessage(roomId, answerChat(roomId, payload.authorName, payload.content, payload.objects ?? getRoomObjects(roomId)));
        io.to(roomId).emit("toast", `${aiProvider} chat failed: ${message}`);
      }

      io.to(roomId).emit("chat-message", aiMessage);
      ack?.(aiMessage);
    }
  );

  socket.on("disconnect", async () => {
    const roomId = socket.data.roomId as string | undefined;
    const participantId = socket.data.participantId as string | undefined;

    if (!roomId || !participantId) {
      return;
    }

    const removed = removeParticipant(roomId, participantId);
    await presenceStore.removeParticipant(roomId, participantId);

    if (removed) {
      socket.to(roomId).emit("toast", `${removed.name} left`);
    }

    await emitParticipants(roomId);
  });
});

server.listen(port, () => {
  console.log(`Daedalus whiteboard API listening on http://127.0.0.1:${port}`);
});
