import * as Y from "yjs";
import type {
  AnalysisResult,
  BoardSummary,
  BoardSnapshot,
  BoardVersionSnapshot,
  BoardComment,
  CanvasObjectPayload,
  CanvasOperation,
  ChatMessage,
  Participant,
  QualityReport,
  SessionSummary
} from "../../shared/src/types";
import type { BoardPersistence, BackendStatus, PersistedBoardRoom } from "./storage/types";

interface BoardRoom {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  tags: string[];
  helpRequested: boolean;
  objects: Y.Map<CanvasObjectPayload>;
  participants: Map<string, Participant>;
  analyses: AnalysisResult[];
  chat: ChatMessage[];
  comments: BoardComment[];
  versions: BoardVersionSnapshot[];
  version: number;
  updatedAt: string;
  doc: Y.Doc;
  appliedOperationIds: Set<string>;
}

const rooms = new Map<string, BoardRoom>();
let persistence: BoardPersistence | null = null;
let persistenceStatus: BackendStatus = {
  name: "memory",
  configured: true,
  durable: false
};

const now = () => new Date().toISOString();

export async function configureBoardPersistence(nextPersistence: BoardPersistence) {
  persistence = nextPersistence;
  persistenceStatus = nextPersistence.status;
  await nextPersistence.initialize();

  const persistedRooms = await nextPersistence.loadRooms();
  rooms.clear();
  persistedRooms.forEach((room) => rooms.set(room.roomId, fromPersistedRoom(room)));
}

export function getBoardPersistenceStatus(): BackendStatus {
  return persistenceStatus;
}

function persistRoom(room: BoardRoom) {
  if (!persistence) {
    return;
  }

  void persistence.saveRoom(toPersistedRoom(room)).catch((error) => {
    console.error(`Failed to persist board ${room.roomId}`, error);
  });
}

function toPersistedRoom(room: BoardRoom): PersistedBoardRoom {
  return {
    roomId: room.roomId,
    boardName: room.boardName,
    classroomId: room.classroomId,
    ownerName: room.ownerName,
    tags: room.tags,
    helpRequested: room.helpRequested,
    objects: Array.from(room.objects.values()),
    analyses: room.analyses,
    chat: room.chat,
    comments: room.comments,
    versions: room.versions,
    version: room.version,
    updatedAt: room.updatedAt
  };
}

function fromPersistedRoom(persisted: PersistedBoardRoom): BoardRoom {
  const doc = new Y.Doc();
  const objects = doc.getMap<CanvasObjectPayload>("objects");
  persisted.objects.forEach((object) => objects.set(object.objectId, object));

  return {
    roomId: persisted.roomId,
    boardName: persisted.boardName,
    classroomId: persisted.classroomId,
    ownerName: persisted.ownerName,
    tags: persisted.tags ?? [],
    helpRequested: persisted.helpRequested,
    objects,
    participants: new Map(),
    analyses: persisted.analyses,
    chat: persisted.chat,
    comments: persisted.comments,
    versions: persisted.versions,
    version: persisted.version,
    updatedAt: persisted.updatedAt,
    doc,
    appliedOperationIds: new Set()
  };
}

export function getOrCreateRoom(roomId: string): BoardRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const room: BoardRoom = {
    roomId,
    boardName: "Untitled board",
    tags: [],
    helpRequested: false,
    doc,
    objects: doc.getMap<CanvasObjectPayload>("objects"),
    participants: new Map(),
    analyses: [],
    chat: [],
    comments: [],
    versions: [],
    version: 0,
    updatedAt: now(),
    appliedOperationIds: new Set()
  };

  rooms.set(roomId, room);
  persistRoom(room);
  return room;
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}

export function serializeRoom(room: BoardRoom): BoardSnapshot {
  return {
    roomId: room.roomId,
    boardName: room.boardName,
    classroomId: room.classroomId,
    ownerName: room.ownerName,
    tags: room.tags,
    helpRequested: room.helpRequested,
    objects: Array.from(room.objects.values()),
    version: room.version,
    updatedAt: room.updatedAt,
    participants: Array.from(room.participants.values()),
    analyses: room.analyses.slice(-10),
    chat: room.chat.slice(-50),
    comments: room.comments.slice(-100),
    versions: room.versions.slice(-30)
  };
}

function createVersionSnapshot(room: BoardRoom, label: string): BoardVersionSnapshot {
  const objects = Array.from(room.objects.values());
  const snapshot: BoardVersionSnapshot = {
    id: crypto.randomUUID(),
    roomId: room.roomId,
    version: room.version,
    label,
    createdAt: now(),
    objectCount: objects.length,
    objects
  };

  room.versions.push(snapshot);
  room.versions = room.versions.slice(-30);
  return snapshot;
}

export function listBoardSummaries(classroomId?: string): BoardSummary[] {
  return Array.from(rooms.values())
    .filter((room) => !classroomId || room.classroomId === classroomId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((room) => ({
      roomId: room.roomId,
      boardName: room.boardName,
      classroomId: room.classroomId,
      ownerName: room.ownerName,
      tags: room.tags,
      helpRequested: room.helpRequested,
      objectCount: room.objects.size,
      commentCount: room.comments.filter((comment) => !comment.resolved).length,
      participantCount: room.participants.size,
      version: room.version,
      updatedAt: room.updatedAt,
      lastAnalysis: room.analyses.at(-1),
      previewObjects: Array.from(room.objects.values()).slice(-80)
    }));
}

export function listBoardSnapshots(classroomId?: string): BoardSnapshot[] {
  return Array.from(rooms.values())
    .filter((room) => !classroomId || room.classroomId === classroomId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(serializeRoom);
}

export function duplicateBoard(sourceRoomId: string, targetRoomId: string, ownerName?: string): BoardSnapshot | null {
  const source = rooms.get(sourceRoomId);

  if (!source) {
    return null;
  }

  const target = getOrCreateRoom(targetRoomId);
  target.boardName = `${source.boardName} copy`;
  target.classroomId = source.classroomId;
  target.ownerName = ownerName ?? source.ownerName;
  target.tags = source.tags;
  target.helpRequested = false;
  target.objects.clear();
  Array.from(source.objects.values()).forEach((object) => {
    const clone = {
      ...JSON.parse(JSON.stringify(object)),
      objectId: `${targetRoomId}-${crypto.randomUUID()}`
    } as CanvasObjectPayload;
    target.objects.set(clone.objectId, clone);
  });
  target.version += 1;
  target.updatedAt = now();
  createVersionSnapshot(target, "Duplicated board");
  persistRoom(target);
  return serializeRoom(target);
}

function buildQualityReport(room: BoardRoom): QualityReport {
  const analysis = room.analyses.at(-1);
  const score = analysis ? Math.max(0, Math.min(100, analysis.complexityScore - analysis.issues.length * 4)) : 25;
  const grade = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 45 ? "needs-work" : "blocked";
  const unresolvedComments = room.comments.filter((comment) => !comment.resolved);
  const risks = [
    ...(analysis?.issues.map((issue) => issue.title) ?? ["No AI analysis has run yet."]),
    ...(unresolvedComments.length > 0 ? [`${unresolvedComments.length} unresolved comments`] : [])
  ];

  return {
    roomId: room.roomId,
    generatedAt: now(),
    diagramType: analysis?.diagramType ?? "Unknown Diagram",
    score,
    grade,
    strengths:
      analysis && analysis.components.length > 0
        ? [`${analysis.components.length} identifiable diagram components`, `AI confidence is ${analysis.confidence}%`]
        : ["Board is ready for a first AI analysis"],
    risks,
    nextSteps: analysis?.hints.slice(0, 4) ?? ["Run AI analysis after adding the first diagram elements."],
    issueCount: analysis?.issues.length ?? 0,
    componentCount: analysis?.components.length ?? 0
  };
}

export function getQualityReport(roomId: string): QualityReport {
  return buildQualityReport(getOrCreateRoom(roomId));
}

export function getSessionSummary(classroomId?: string): SessionSummary {
  const selectedRooms = Array.from(rooms.values()).filter((room) => !classroomId || room.classroomId === classroomId);
  const reports = selectedRooms.map((room) => buildQualityReport(room));
  const averageQualityScore =
    reports.length > 0 ? Math.round(reports.reduce((total, report) => total + report.score, 0) / reports.length) : 0;

  return {
    classroomId,
    generatedAt: now(),
    boardCount: selectedRooms.length,
    helpRequestedCount: selectedRooms.filter((room) => room.helpRequested).length,
    averageQualityScore,
    boards: selectedRooms.map((room) => {
      const report = buildQualityReport(room);
      const analysis = room.analyses.at(-1);

      return {
        roomId: room.roomId,
        boardName: room.boardName,
        ownerName: room.ownerName,
        diagramType: analysis?.diagramType,
        qualityScore: report.score,
        helpRequested: room.helpRequested,
        unresolvedCommentCount: room.comments.filter((comment) => !comment.resolved).length,
        summary: analysis?.summary ?? "No AI analysis yet."
      };
    })
  };
}

export function formatSessionSummaryMarkdown(summary: SessionSummary): string {
  const lines = [
    `# Session Summary${summary.classroomId ? ` - ${summary.classroomId}` : ""}`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Boards: ${summary.boardCount}`,
    `Help requested: ${summary.helpRequestedCount}`,
    `Average quality score: ${summary.averageQualityScore}`,
    "",
    "| Board | Owner | Type | Score | Help | Comments | Summary |",
    "|---|---|---|---:|---|---:|---|"
  ];

  summary.boards.forEach((board) => {
    lines.push(
      `| ${board.boardName} | ${board.ownerName ?? "Guest"} | ${board.diagramType ?? "Unknown"} | ${board.qualityScore} | ${
        board.helpRequested ? "Yes" : "No"
      } | ${board.unresolvedCommentCount} | ${board.summary.replace(/\|/g, "\\|")} |`
    );
  });

  return `${lines.join("\n")}\n`;
}

export function listComments(roomId: string): BoardComment[] {
  return getOrCreateRoom(roomId).comments.slice();
}

export function addComment(
  roomId: string,
  comment: Pick<BoardComment, "authorId" | "authorName" | "body" | "anchor">
): BoardComment {
  const room = getOrCreateRoom(roomId);
  const createdAt = now();
  const fullComment: BoardComment = {
    id: crypto.randomUUID(),
    roomId,
    authorId: comment.authorId,
    authorName: comment.authorName,
    body: comment.body,
    anchor: comment.anchor,
    resolved: false,
    createdAt,
    updatedAt: createdAt
  };

  room.comments.push(fullComment);
  room.updatedAt = now();
  persistRoom(room);
  return fullComment;
}

export function updateComment(
  roomId: string,
  commentId: string,
  patch: Partial<Pick<BoardComment, "body" | "resolved">>
): BoardComment | null {
  const room = getOrCreateRoom(roomId);
  const index = room.comments.findIndex((comment) => comment.id === commentId);

  if (index === -1) {
    return null;
  }

  const updated = {
    ...room.comments[index],
    ...patch,
    updatedAt: now()
  };

  room.comments[index] = updated;
  room.updatedAt = now();
  persistRoom(room);
  return updated;
}

export function updateBoardMetadata(
  roomId: string,
  patch: Partial<Pick<BoardRoom, "boardName" | "classroomId" | "ownerName" | "tags" | "helpRequested">>
): BoardSnapshot {
  const room = getOrCreateRoom(roomId);

  if (typeof patch.boardName === "string" && patch.boardName.trim()) {
    room.boardName = patch.boardName.trim();
  }

  if (typeof patch.classroomId === "string") {
    room.classroomId = patch.classroomId.trim() || undefined;
  }

  if (typeof patch.ownerName === "string" && patch.ownerName.trim()) {
    room.ownerName = patch.ownerName.trim();
  }

  if (Array.isArray(patch.tags)) {
    room.tags = patch.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  }

  if (typeof patch.helpRequested === "boolean") {
    room.helpRequested = patch.helpRequested;
  }

  room.updatedAt = now();
  persistRoom(room);
  return serializeRoom(room);
}

export function getRoomVersions(roomId: string): BoardVersionSnapshot[] {
  return getOrCreateRoom(roomId).versions.slice(-30);
}

export function restoreRoomVersion(roomId: string, snapshotId: string, userId: string): CanvasOperation | null {
  const room = getOrCreateRoom(roomId);
  const snapshot = room.versions.find((candidate) => candidate.id === snapshotId);

  if (!snapshot) {
    return null;
  }

  room.objects.clear();
  snapshot.objects.forEach((object) => room.objects.set(object.objectId, object));
  room.version += 1;
  room.updatedAt = now();
  createVersionSnapshot(room, `Restored version ${snapshot.version}`);
  persistRoom(room);

  return {
    type: "replace",
    userId,
    boardVersion: room.version,
    objects: Array.from(room.objects.values())
  };
}

export function joinParticipant(roomId: string, participant: Participant): Participant {
  const room = getOrCreateRoom(roomId);
  const existing = room.participants.get(participant.id);
  const merged: Participant = {
    ...participant,
    joinedAt: existing?.joinedAt ?? participant.joinedAt,
    online: true,
    lastActiveAt: now()
  };

  room.participants.set(participant.id, merged);
  room.ownerName = room.ownerName ?? participant.name;
  room.updatedAt = now();
  persistRoom(room);
  return merged;
}

export function updateParticipant(roomId: string, participantId: string, patch: Partial<Participant>): Participant | null {
  const room = getOrCreateRoom(roomId);
  const participant = room.participants.get(participantId);

  if (!participant) {
    return null;
  }

  const updated = {
    ...participant,
    ...patch,
    lastActiveAt: now()
  };

  room.participants.set(participantId, updated);
  room.updatedAt = now();
  return updated;
}

export function removeParticipant(roomId: string, participantId: string): Participant | null {
  const room = rooms.get(roomId);

  if (!room) {
    return null;
  }

  const participant = room.participants.get(participantId);

  if (!participant) {
    return null;
  }

  room.participants.delete(participantId);
  room.updatedAt = now();
  return {
    ...participant,
    online: false,
    lastActiveAt: now()
  };
}

export function applyCanvasOperation(roomId: string, operation: CanvasOperation): CanvasOperation {
  const room = getOrCreateRoom(roomId);

  if (operation.operationId && room.appliedOperationIds.has(operation.operationId)) {
    return {
      ...operation,
      boardVersion: room.version,
      duplicate: true
    };
  }

  const boardVersion = room.version + 1;
  room.version = boardVersion;
  room.updatedAt = now();

  room.doc.transact(() => {
    if (operation.type === "upsert") {
      const existing = room.objects.get(operation.object.objectId);
      room.objects.set(operation.object.objectId, {
        ...(existing ?? {}),
        ...operation.object,
        objectId: operation.object.objectId
      });
      return;
    }

    if (operation.type === "delete") {
      room.objects.delete(operation.objectId);
      return;
    }

    if (operation.type === "replace") {
      room.objects.clear();
      operation.objects.forEach((object) => room.objects.set(object.objectId, object));
      return;
    }

    room.objects.clear();
  }, operation.operationId ?? operation.userId);

  if (operation.operationId) {
    room.appliedOperationIds.add(operation.operationId);
    room.appliedOperationIds = new Set(Array.from(room.appliedOperationIds).slice(-500));
  }

  createVersionSnapshot(room, `Version ${boardVersion}`);
  persistRoom(room);
  return {
    ...operation,
    boardVersion
  };
}

export function addAnalysis(roomId: string, analysis: AnalysisResult): AnalysisResult {
  const room = getOrCreateRoom(roomId);
  room.analyses.push(analysis);
  room.analyses = room.analyses.slice(-30);
  room.updatedAt = now();
  persistRoom(room);
  return analysis;
}

export function addChatMessage(roomId: string, message: ChatMessage): ChatMessage {
  const room = getOrCreateRoom(roomId);
  room.chat.push(message);
  room.chat = room.chat.slice(-100);
  room.updatedAt = now();
  persistRoom(room);
  return message;
}

export function getRoomObjects(roomId: string): CanvasObjectPayload[] {
  return Array.from(getOrCreateRoom(roomId).objects.values());
}
