import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import type {
  BoardComment,
  AuthSession,
  CanvasObjectPayload,
  CanvasOperation,
  ChatMessage,
  CollaborationRoom,
  CursorPayload,
  IntegrationStatus,
  LanguageCode,
  Participant
} from "../../shared/src/types";
import { boardTemplates } from "../../shared/src/templates";
import {
  addAnalysis,
  addChatMessage,
  addComment,
  applyCanvasOperation,
  createNamedCheckpoint,
  formatSessionSummaryMarkdown,
  getBoardLanguage,
  getLatestAnalysis,
  getOrCreateRoom,
  getQualityReport,
  getRoomObjects,
  getRoomVersions,
  getSessionDebrief,
  getSessionSummary,
  getStorageStatus,
  initializeBoardStore,
  joinParticipant,
  listBoardSummaries,
  listComments,
  removeParticipant,
  restoreRoomVersion,
  serializeRoom,
  updateComment,
  updateBoardMetadata,
  updateBoardThumbnail,
  updateParticipant
} from "./boardStore";
import { analyzeCanvasWithGroq, answerChatWithGroq } from "./ai/groqAnalyzer";
import {
  generateDiagramArtifactWithGroq,
  generateSessionDebriefWithGroq,
  localizeAnalysisWithGroq,
  suggestLayoutWithGroq
} from "./ai/groqEnhancements";
import { analyzeCanvas, answerChat } from "./ai/mockAnalyzer";
import {
  buildAutoLayoutOperation,
  generateDiagramArtifact,
  getInstitutionTuningProfile,
  localizeAnalysis,
  normalizeLanguage,
  suggestLayout
} from "./ai/phase4Enhancements";
import { boardToPdf, boardToSvg, sessionPackage } from "./exporters";
import {
  getRealtimeScaleStatus,
  initializeRealtimeScale,
  listPresence,
  removePresence,
  setPresence,
  updatePresence
} from "./realtimeScale";
import {
  acceptRoomInvite,
  accessRoom,
  archiveRoom,
  canEditRoom,
  canManageRoom,
  createCollaborationRoom,
  createRoomInvite,
  getAuthStoreStatus,
  getCollaborationRoom,
  getSession,
  listRoomMembers,
  listRoomsForUser,
  loginUser,
  logoutSession,
  removeRoomMember,
  touchCollaborationRoom,
  updateRoomDetails,
  updateRoomMemberRole
} from "./authStore";

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:5173";
const aiProvider = process.env.AI_PROVIDER ?? "mock";

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    credentials: true
  }
});

async function roomParticipants(roomId: string) {
  return listPresence(roomId, serializeRoom(getOrCreateRoom(roomId)).participants);
}

async function emitParticipants(roomId: string) {
  io.to(roomId).emit("participants-updated", await roomParticipants(roomId));
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));

const objectSchema = z.record(z.unknown()).and(z.object({ objectId: z.string().min(1) }));
const languageSchema = z.enum(["en", "es", "hi", "zh"]);
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

const loginSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["student", "instructor", "user"]).default("student")
});
const roomCreateSchema = z.object({
  name: z.string().min(1).max(120),
  classroomId: z.string().max(80).optional(),
  visibility: z.enum(["private", "public"]).default("private")
});
const roomUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  classroomId: z.string().max(80).optional(),
  visibility: z.enum(["private", "public"]).optional()
});
const inviteCreateSchema = z.object({
  role: z.enum(["editor", "viewer", "instructor"]).default("editor")
});
const thumbnailSchema = z.object({
  thumbnailDataUrl: z.string().startsWith("data:image/").max(300_000)
});
const checkpointSchema = z.object({
  label: z.string().min(1).max(80)
});

function withBoardPreview(room: CollaborationRoom): CollaborationRoom {
  const snapshot = serializeRoom(getOrCreateRoom(room.roomId));
  return {
    ...room,
    thumbnailDataUrl: snapshot.thumbnailDataUrl,
    objectCount: snapshot.objects.length,
    updatedAt: snapshot.updatedAt.localeCompare(room.updatedAt) > 0 ? snapshot.updatedAt : room.updatedAt
  };
}

function bearerToken(headerValue: unknown) {
  if (typeof headerValue !== "string") {
    return undefined;
  }

  const [scheme, token] = headerValue.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function sessionFromRequest(request: express.Request): AuthSession | undefined {
  return getSession(bearerToken(request.headers.authorization));
}

function requireSession(request: express.Request, response: express.Response): AuthSession | undefined {
  const session = sessionFromRequest(request);

  if (!session) {
    response.status(401).json({ error: "Login required" });
    return undefined;
  }

  return session;
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
      configured: Boolean(process.env.GOOGLE_CLASSROOM_CLIENT_ID && process.env.GOOGLE_CLASSROOM_CLIENT_SECRET),
      status: process.env.GOOGLE_CLASSROOM_CLIENT_ID && process.env.GOOGLE_CLASSROOM_CLIENT_SECRET ? "ready" : "stub",
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

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "daedalus-whiteboard-api",
    aiProvider,
    groqConfigured: Boolean(process.env.GROQ_API_KEY)
  });
});

app.post("/api/auth/login", (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  response.status(201).json(
    loginUser({
      name: parsed.data.name,
      email: parsed.data.email || undefined,
      role: parsed.data.role
    })
  );
});

app.get("/api/auth/me", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  response.json(session);
});

app.post("/api/auth/logout", (request, response) => {
  logoutSession(bearerToken(request.headers.authorization));
  response.status(204).send();
});

app.get("/api/rooms", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  response.json(
    listRoomsForUser(session.user.id)
      .map(withBoardPreview)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );
});

app.post("/api/rooms", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const parsed = roomCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const room = createCollaborationRoom({
    name: parsed.data.name,
    classroomId: parsed.data.classroomId,
    visibility: parsed.data.visibility,
    owner: session.user
  });
  updateBoardMetadata(room.roomId, {
    boardName: room.name,
    classroomId: room.classroomId,
    ownerName: room.ownerName
  });

  response.status(201).json(withBoardPreview(room));
});

app.post("/api/rooms/join", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const parsed = z
    .object({
      roomId: z.string().min(3).max(80)
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = accessRoom(parsed.data.roomId, session.user);

  if (existing) {
    response.json(withBoardPreview(existing.room));
    return;
  }

  response.status(403).json({ error: "You do not have access to this room. Ask the owner for an invite link." });
});

app.get("/api/rooms/:roomId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const access = accessRoom(request.params.roomId, session.user);

  if (!access) {
    response.status(403).json({ error: "Room access denied" });
    return;
  }

  response.json(withBoardPreview(access.room));
});

app.patch("/api/rooms/:roomId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const parsed = roomUpdateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const room = updateRoomDetails(request.params.roomId, parsed.data, session.user);

  if (!room) {
    response.status(403).json({ error: "Only room owners and instructors can change room settings." });
    return;
  }

  updateBoardMetadata(room.roomId, {
    boardName: room.name,
    classroomId: room.classroomId,
    ownerName: room.ownerName
  });
  io.to(room.roomId).emit("board-state", serializeRoom(getOrCreateRoom(room.roomId)));
  response.json(withBoardPreview(room));
});

app.delete("/api/rooms/:roomId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const room = archiveRoom(request.params.roomId, session.user);

  if (!room) {
    response.status(403).json({ error: "Only room owners and instructors can archive rooms." });
    return;
  }

  io.to(room.roomId).emit("toast", "This room was archived by the owner.");
  response.json(withBoardPreview(room));
});

app.get("/api/rooms/:roomId/members", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const members = listRoomMembers(request.params.roomId, session.user);

  if (!members) {
    response.status(403).json({ error: "Room access denied" });
    return;
  }

  response.json(members);
});

app.patch("/api/rooms/:roomId/members/:userId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const parsed = z
    .object({
      role: z.enum(["editor", "viewer", "instructor"])
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const members = updateRoomMemberRole(request.params.roomId, request.params.userId, parsed.data.role, session.user);

  if (!members) {
    response.status(403).json({ error: "Only room owners and instructors can manage non-owner members." });
    return;
  }

  io.to(request.params.roomId).emit("toast", "Room membership changed.");
  response.json(members);
});

app.delete("/api/rooms/:roomId/members/:userId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const members = removeRoomMember(request.params.roomId, request.params.userId, session.user);

  if (!members) {
    response.status(403).json({ error: "Only room owners and instructors can remove non-owner members." });
    return;
  }

  io.to(request.params.roomId).emit("toast", "A room member was removed.");
  response.json(members);
});

app.post("/api/rooms/:roomId/invites", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const parsed = inviteCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const invite = createRoomInvite({
    roomId: request.params.roomId,
    role: parsed.data.role,
    createdBy: session.user
  });

  if (!invite) {
    response.status(403).json({ error: "Only room owners and instructors can create invites." });
    return;
  }

  response.status(201).json(invite);
});

app.post("/api/rooms/invites/:code/accept", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  const access = acceptRoomInvite(request.params.code, session.user);

  if (!access) {
    response.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  response.json({
    ...access,
    room: withBoardPreview(access.room)
  });
});

app.get("/api/templates", (_request, response) => {
  response.json(boardTemplates);
});

app.get("/api/integrations", (_request, response) => {
  response.json(integrationStatuses());
});

app.get("/api/storage/status", (_request, response) => {
  response.json({
    boards: getStorageStatus(),
    auth: getAuthStoreStatus(),
    realtime: getRealtimeScaleStatus()
  });
});

app.get("/api/ai/institution-profile", (_request, response) => {
  response.json(getInstitutionTuningProfile());
});

app.post("/api/integrations/slack/share", async (request, response) => {
  const parsed = z
    .object({
      classroomId: z.string().optional(),
      roomId: z.string().optional(),
      text: z.string().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const summary = parsed.data.classroomId ? getSessionSummary(parsed.data.classroomId) : undefined;
  const qualityReport = parsed.data.roomId ? getQualityReport(parsed.data.roomId) : undefined;
  const text =
    parsed.data.text ??
    (summary
      ? `Daedalus session summary: ${summary.boardCount} boards, ${summary.helpRequestedCount} help requests, average quality ${summary.averageQualityScore}.`
      : qualityReport
        ? `Daedalus board quality: ${qualityReport.diagramType}, score ${qualityReport.score}, ${qualityReport.issueCount} issues.`
        : "Daedalus update");

  if (!webhookUrl) {
    response.status(202).json({
      sent: false,
      reason: "SLACK_WEBHOOK_URL is not configured",
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
  if (aiProvider === "groq" && process.env.GROQ_API_KEY && imageDataUrl) {
    return analyzeCanvasWithGroq(roomId, objects, imageDataUrl);
  }

  return analyzeCanvas(roomId, objects);
}

async function answerBoardChat(
  roomId: string,
  authorName: string,
  prompt: string,
  objects: CanvasObjectPayload[],
  imageDataUrl?: string
) {
  if (aiProvider === "groq" && process.env.GROQ_API_KEY && imageDataUrl) {
    return answerChatWithGroq(roomId, authorName, prompt, objects, imageDataUrl);
  }

  return answerChat(roomId, authorName, prompt, objects);
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

app.get("/api/boards", (request, response) => {
  const classroomId = typeof request.query.classroomId === "string" ? request.query.classroomId : undefined;
  response.json(listBoardSummaries(classroomId));
});

app.get("/api/boards/:roomId", (request, response) => {
  response.json(serializeRoom(getOrCreateRoom(request.params.roomId)));
});

app.post("/api/boards/:roomId/thumbnail", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!canEditRoom(request.params.roomId, session.user.id)) {
    response.status(403).json({ error: "Editor access is required to update board thumbnails." });
    return;
  }

  const parsed = thumbnailSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = updateBoardThumbnail(request.params.roomId, parsed.data.thumbnailDataUrl);
  io.to(request.params.roomId).emit("board-state", snapshot);
  response.json(snapshot);
});

app.get("/api/boards/:roomId/export/svg", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!accessRoom(request.params.roomId, session.user)) {
    response.status(403).json({ error: "Room access denied" });
    return;
  }

  const board = serializeRoom(getOrCreateRoom(request.params.roomId));
  response.type("image/svg+xml").send(boardToSvg(board));
});

app.get("/api/boards/:roomId/export/pdf", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!accessRoom(request.params.roomId, session.user)) {
    response.status(403).json({ error: "Room access denied" });
    return;
  }

  const board = serializeRoom(getOrCreateRoom(request.params.roomId));
  const pdf = boardToPdf(board, getQualityReport(request.params.roomId));
  response.type("application/pdf").send(pdf);
});

app.get("/api/boards/:roomId/quality-report", (request, response) => {
  response.json(getQualityReport(request.params.roomId));
});

app.get("/api/boards/:roomId/generated-code", async (request, response) => {
  const roomId = request.params.roomId;

  try {
    response.json(await generateDiagramArtifactWithGroq(roomId, getRoomObjects(roomId), getLatestAnalysis(roomId)));
  } catch {
    response.json(generateDiagramArtifact(roomId, getRoomObjects(roomId), getLatestAnalysis(roomId)));
  }
});

app.get("/api/boards/:roomId/layout-suggestions", async (request, response) => {
  try {
    response.json(await suggestLayoutWithGroq(request.params.roomId, getRoomObjects(request.params.roomId)));
  } catch {
    response.json(suggestLayout(request.params.roomId, getRoomObjects(request.params.roomId)));
  }
});

app.post("/api/boards/:roomId/auto-layout", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!canEditRoom(request.params.roomId, session.user.id)) {
    response.status(403).json({ error: "Editor access is required to apply auto-layout." });
    return;
  }

  const parsed = z
    .object({
      userId: z.string().default("system"),
      clientId: z.string().optional()
    })
    .safeParse(request.body ?? {});

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const roomId = request.params.roomId;
  const operation = buildAutoLayoutOperation(
    roomId,
    getRoomObjects(roomId),
    parsed.data.userId,
    getLatestAnalysis(roomId),
    parsed.data.clientId
  );

  if (!operation) {
    response.status(422).json({ error: "Auto-layout needs at least two diagram elements." });
    return;
  }

  const applied = applyCanvasOperation(roomId, operation);
  io.to(roomId).emit("canvas-operation", applied);
  io.to(roomId).emit("board-state", serializeRoom(getOrCreateRoom(roomId)));
  response.json(applied);
});

app.get("/api/boards/:roomId/localized-analysis", async (request, response) => {
  const roomId = request.params.roomId;
  const language = normalizeLanguage(request.query.language, getBoardLanguage(roomId));
  const analysis = getLatestAnalysis(roomId) ?? analyzeCanvas(roomId, getRoomObjects(roomId));

  try {
    response.json(await localizeAnalysisWithGroq(analysis, language));
  } catch {
    response.json(localizeAnalysis(analysis, language));
  }
});

app.get("/api/boards/:roomId/comments", (request, response) => {
  response.json(listComments(request.params.roomId));
});

app.post("/api/boards/:roomId/comments", (request, response) => {
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
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!canManageRoom(request.params.roomId, session.user.id)) {
    response.status(403).json({ error: "Only room owners and instructors can update board metadata." });
    return;
  }

  const parsed = z
    .object({
      boardName: z.string().optional(),
      classroomId: z.string().optional(),
      ownerName: z.string().optional(),
      preferredLanguage: languageSchema.optional(),
      helpRequested: z.boolean().optional()
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = updateBoardMetadata(request.params.roomId, parsed.data);
  io.to(request.params.roomId).emit("board-state", snapshot);
  response.json(snapshot);
});

app.get("/api/boards/:roomId/versions", (request, response) => {
  response.json(getRoomVersions(request.params.roomId));
});

app.post("/api/boards/:roomId/checkpoints", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!canEditRoom(request.params.roomId, session.user.id)) {
    response.status(403).json({ error: "Editor access is required to create checkpoints." });
    return;
  }

  const parsed = checkpointSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = createNamedCheckpoint(request.params.roomId, parsed.data.label);
  io.to(request.params.roomId).emit("board-state", serializeRoom(getOrCreateRoom(request.params.roomId)));
  response.status(201).json(snapshot);
});

app.get("/api/classrooms/:classroomId/summary", (request, response) => {
  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);

  if (request.query.format === "markdown") {
    response.type("text/markdown").send(formatSessionSummaryMarkdown(summary));
    return;
  }

  response.json(summary);
});

app.get("/api/classrooms/:classroomId/debrief", async (request, response) => {
  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);
  const fallback = getSessionDebrief(classroomId);

  try {
    response.json(await generateSessionDebriefWithGroq(summary, fallback));
  } catch {
    response.json(fallback);
  }
});

app.get("/api/classrooms/:classroomId/export/package", async (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (session.user.role !== "instructor") {
    response.status(403).json({ error: "Instructor role is required for session package export." });
    return;
  }

  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);
  const fallbackDebrief = getSessionDebrief(classroomId);
  let debrief = fallbackDebrief;

  try {
    debrief = await generateSessionDebriefWithGroq(summary, fallbackDebrief);
  } catch {
    debrief = fallbackDebrief;
  }

  const boards = listBoardSummaries(classroomId).map((board) => ({
    board: serializeRoom(getOrCreateRoom(board.roomId)),
    qualityReport: getQualityReport(board.roomId)
  }));

  response.json(sessionPackage({ summary, debrief, boards }));
});

app.post("/api/boards/:roomId/restore/:snapshotId", (request, response) => {
  const session = requireSession(request, response);

  if (!session) {
    return;
  }

  if (!canEditRoom(request.params.roomId, session.user.id)) {
    response.status(403).json({ error: "Editor access is required to restore board versions." });
    return;
  }

  const parsed = z
    .object({
      userId: z.string().default("system"),
      clientId: z.string().optional()
    })
    .safeParse(request.body ?? {});

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const operation = restoreRoomVersion(request.params.roomId, request.params.snapshotId, parsed.data.userId, parsed.data.clientId);

  if (!operation) {
    response.status(404).json({ error: "Version snapshot not found" });
    return;
  }

  io.to(request.params.roomId).emit("canvas-operation", operation);
  io.to(request.params.roomId).emit("board-state", serializeRoom(getOrCreateRoom(request.params.roomId)));
  response.json(operation);
});

io.on("connection", (socket) => {
  socket.on("join-board", async (payload: { roomId: string; participant: Participant; authToken?: string; classroomId?: string; boardName?: string }) => {
    const session = getSession(payload.authToken);

    if (!session) {
      socket.emit("auth-error", "Login required");
      socket.disconnect(true);
      return;
    }

    const access = accessRoom(payload.roomId, session.user);

    if (!access) {
      socket.emit("auth-error", "You do not have access to this room.");
      socket.disconnect(true);
      return;
    }

    const savedRoom = access.room;
    const participant: Participant = {
      ...payload.participant,
      id: session.user.id,
      name: session.user.name,
      color: session.user.color,
      role: access.membership.role
    };
    const boardName = savedRoom.name ?? payload.boardName;
    const classroomId = savedRoom.classroomId ?? payload.classroomId;

    if (classroomId || boardName) {
      updateBoardMetadata(payload.roomId, {
        classroomId,
        boardName,
        ownerName: savedRoom?.ownerName ?? participant.name
      });
    }

    const joinedParticipant = joinParticipant(payload.roomId, participant, socket.id);
    socket.join(payload.roomId);
    socket.data.roomId = payload.roomId;
    socket.data.participantId = joinedParticipant.id;
    socket.data.authUserId = session.user.id;
    socket.data.roomRole = access.membership.role;

    const room = getOrCreateRoom(payload.roomId);
    await setPresence(payload.roomId, socket.id, joinedParticipant);
    socket.emit("board-state", {
      ...serializeRoom(room),
      participants: await roomParticipants(payload.roomId)
    });
    socket.to(payload.roomId).emit("toast", `${joinedParticipant.name} joined`);
    await emitParticipants(payload.roomId);
  });

  socket.on(
    "board-meta-update",
    (patch: { boardName?: string; classroomId?: string; preferredLanguage?: LanguageCode; helpRequested?: boolean }) => {
      const roomId = socket.data.roomId as string | undefined;
      const userId = socket.data.authUserId as string | undefined;

      if (!roomId || !userId) {
        return;
      }

      if (!canManageRoom(roomId, userId)) {
        socket.emit("toast", "Only room owners and instructors can update room settings.");
        return;
      }

      const snapshot = updateBoardMetadata(roomId, patch);
      touchCollaborationRoom(roomId, {
        name: patch.boardName,
        classroomId: patch.classroomId
      });
      io.to(roomId).emit("board-state", snapshot);
    }
  );

  socket.on(
    "comment-create",
    (payload: Omit<BoardComment, "id" | "roomId" | "resolved" | "createdAt" | "updatedAt">, ack?: (comment: BoardComment) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      const userId = socket.data.authUserId as string | undefined;

      if (!roomId || !userId) {
        return;
      }

      if (!canEditRoom(roomId, userId)) {
        socket.emit("toast", "Editor access is required to add comments.");
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
    const userId = socket.data.authUserId as string | undefined;

    if (!roomId || !userId) {
      return;
    }

    if (!canEditRoom(roomId, userId)) {
      socket.emit("toast", "Editor access is required to update comments.");
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

    updateParticipant(roomId, participantId, patch);
    await updatePresence(roomId, socket.id, patch);
    await emitParticipants(roomId);
  });

  socket.on("canvas-operation", (operation: CanvasOperation, ack?: (operation: CanvasOperation) => void) => {
    const roomId = socket.data.roomId as string | undefined;
    const userId = socket.data.authUserId as string | undefined;

    if (!roomId || !userId) {
      return;
    }

    if (!canEditRoom(roomId, userId)) {
      socket.emit("toast", "Editor access is required to change the canvas.");
      return;
    }

    const applied = applyCanvasOperation(roomId, operation);
    socket.to(roomId).emit("canvas-operation", applied);
    io.to(roomId).emit("board-state", serializeRoom(getOrCreateRoom(roomId)));
    ack?.(applied);
  });

  socket.on("cursor-update", (cursor: CursorPayload) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
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

      const objects = payload.objects ?? getRoomObjects(roomId);

      try {
        const analysis = addAnalysis(roomId, await analyzeBoard(roomId, objects, payload.imageDataUrl));
        io.to(roomId).emit("ai-analysis", analysis);
        ack?.(analysis);
      } catch (error) {
        const fallback = addAnalysis(roomId, analyzeCanvas(roomId, objects));
        io.to(roomId).emit("toast", error instanceof Error ? `Groq analysis failed: ${error.message}` : "Groq analysis failed");
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
        aiMessage = addChatMessage(roomId, answerChat(roomId, payload.authorName, payload.content, payload.objects ?? getRoomObjects(roomId)));
        io.to(roomId).emit("toast", error instanceof Error ? `Groq chat failed: ${error.message}` : "Groq chat failed");
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

    const removed = removeParticipant(roomId, participantId, socket.id);
    await removePresence(roomId, socket.id);

    if (removed) {
      socket.to(roomId).emit("toast", `${removed.name} left`);
    }

    await emitParticipants(roomId);
  });
});

Promise.all([initializeBoardStore(), initializeRealtimeScale(io)])
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Server initialization failed");
  })
  .finally(() => {
    server.listen(port, () => {
      console.log(`Daedalus whiteboard API listening on http://127.0.0.1:${port}`);
    });
  });

export { app, io, server };
