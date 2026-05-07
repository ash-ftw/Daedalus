import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
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
  formatSessionSummaryMarkdown,
  getOrCreateRoom,
  getQualityReport,
  getRoomObjects,
  getRoomVersions,
  getSessionSummary,
  joinParticipant,
  listBoardSummaries,
  listComments,
  removeParticipant,
  restoreRoomVersion,
  serializeRoom,
  updateComment,
  updateBoardMetadata,
  updateParticipant
} from "./boardStore";
import { analyzeCanvasWithGroq, answerChatWithGroq } from "./ai/groqAnalyzer";
import { analyzeCanvas, answerChat } from "./ai/mockAnalyzer";

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

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));

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

app.get("/api/templates", (_request, response) => {
  response.json(boardTemplates);
});

app.get("/api/integrations", (_request, response) => {
  response.json(integrationStatuses());
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

app.get("/api/boards/:roomId/quality-report", (request, response) => {
  response.json(getQualityReport(request.params.roomId));
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
  const parsed = z
    .object({
      boardName: z.string().optional(),
      classroomId: z.string().optional(),
      ownerName: z.string().optional(),
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

app.get("/api/classrooms/:classroomId/summary", (request, response) => {
  const classroomId = request.params.classroomId === "all" ? undefined : request.params.classroomId;
  const summary = getSessionSummary(classroomId);

  if (request.query.format === "markdown") {
    response.type("text/markdown").send(formatSessionSummaryMarkdown(summary));
    return;
  }

  response.json(summary);
});

app.post("/api/boards/:roomId/restore/:snapshotId", (request, response) => {
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
  io.to(request.params.roomId).emit("board-state", serializeRoom(getOrCreateRoom(request.params.roomId)));
  response.json(operation);
});

io.on("connection", (socket) => {
  socket.on("join-board", (payload: { roomId: string; participant: Participant; classroomId?: string; boardName?: string }) => {
    if (payload.classroomId || payload.boardName) {
      updateBoardMetadata(payload.roomId, {
        classroomId: payload.classroomId,
        boardName: payload.boardName,
        ownerName: payload.participant.name
      });
    }

    const participant = joinParticipant(payload.roomId, payload.participant);
    socket.join(payload.roomId);
    socket.data.roomId = payload.roomId;
    socket.data.participantId = participant.id;

    const room = getOrCreateRoom(payload.roomId);
    socket.emit("board-state", serializeRoom(room));
    socket.to(payload.roomId).emit("toast", `${participant.name} joined`);
    io.to(payload.roomId).emit("participants-updated", serializeRoom(room).participants);
  });

  socket.on("board-meta-update", (patch: { boardName?: string; classroomId?: string; helpRequested?: boolean }) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    const snapshot = updateBoardMetadata(roomId, patch);
    io.to(roomId).emit("board-state", snapshot);
  });

  socket.on(
    "comment-create",
    (payload: Omit<BoardComment, "id" | "roomId" | "resolved" | "createdAt" | "updatedAt">, ack?: (comment: BoardComment) => void) => {
      const roomId = socket.data.roomId as string | undefined;

      if (!roomId) {
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

    updateComment(roomId, payload.commentId, {
      body: payload.body,
      resolved: payload.resolved
    });
    io.to(roomId).emit("comments-updated", listComments(roomId));
  });

  socket.on("participant-update", (patch: Partial<Participant>) => {
    const roomId = socket.data.roomId as string | undefined;
    const participantId = socket.data.participantId as string | undefined;

    if (!roomId || !participantId) {
      return;
    }

    updateParticipant(roomId, participantId, patch);
    io.to(roomId).emit("participants-updated", serializeRoom(getOrCreateRoom(roomId)).participants);
  });

  socket.on("canvas-operation", (operation: CanvasOperation, ack?: (operation: CanvasOperation) => void) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
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

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;
    const participantId = socket.data.participantId as string | undefined;

    if (!roomId || !participantId) {
      return;
    }

    const removed = removeParticipant(roomId, participantId);
    const room = getOrCreateRoom(roomId);

    if (removed) {
      socket.to(roomId).emit("toast", `${removed.name} left`);
    }

    io.to(roomId).emit("participants-updated", serializeRoom(room).participants);
  });
});

server.listen(port, () => {
  console.log(`Daedalus whiteboard API listening on http://127.0.0.1:${port}`);
});
