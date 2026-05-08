import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type {
  AnalysisResult,
  BoardSummary,
  BoardSnapshot,
  BoardVersionSnapshot,
  BoardComment,
  CanvasObjectPayload,
  CanvasOperation,
  ChatMessage,
  LanguageCode,
  Participant,
  QualityReport,
  SessionDebrief,
  SessionSummary,
  StorageStatus
} from "../../shared/src/types";

interface BoardRoom {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  thumbnailDataUrl?: string;
  preferredLanguage: LanguageCode;
  helpRequested: boolean;
  objects: Map<string, CanvasObjectPayload>;
  participants: Map<string, Participant>;
  participantConnections: Map<string, Set<string>>;
  analyses: AnalysisResult[];
  chat: ChatMessage[];
  comments: BoardComment[];
  versions: BoardVersionSnapshot[];
  version: number;
  updatedAt: string;
}

const rooms = new Map<string, BoardRoom>();

const now = () => new Date().toISOString();

interface PersistedBoardRoom {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  thumbnailDataUrl?: string;
  preferredLanguage?: LanguageCode;
  helpRequested: boolean;
  objects: CanvasObjectPayload[];
  analyses: AnalysisResult[];
  chat: ChatMessage[];
  comments: BoardComment[];
  versions: BoardVersionSnapshot[];
  version: number;
  updatedAt: string;
}

interface PersistedBoardStore {
  schemaVersion: 1;
  savedAt: string;
  rooms: PersistedBoardRoom[];
}

const persistenceEnabled = process.env.BOARD_STORE_PERSISTENCE !== "off";
const persistencePath = process.env.BOARD_STORE_PATH?.trim() || path.join(process.cwd(), "data", "boards.snapshot.json");
const databaseUrl = process.env.DATABASE_URL?.trim();
const migrationsPath =
  process.env.DATABASE_MIGRATIONS_PATH?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
let lastPersistedAt: string | undefined;
let lastPersistenceError: string | undefined;
let activePersistenceProvider: StorageStatus["provider"] = persistenceEnabled ? "file" : "memory";
let postgresPool: pg.Pool | undefined;

function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "en" || value === "es" || value === "hi" || value === "zh";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function roomToPersisted(room: BoardRoom): PersistedBoardRoom {
  return {
    roomId: room.roomId,
    boardName: room.boardName,
    classroomId: room.classroomId,
    ownerName: room.ownerName,
    thumbnailDataUrl: room.thumbnailDataUrl,
    preferredLanguage: room.preferredLanguage,
    helpRequested: room.helpRequested,
    objects: Array.from(room.objects.values()),
    analyses: room.analyses.slice(-30),
    chat: room.chat.slice(-100),
    comments: room.comments.slice(-100),
    versions: room.versions.slice(-10),
    version: room.version,
    updatedAt: room.updatedAt
  };
}

function writeFilePersistedRooms() {
  if (!persistenceEnabled) {
    return;
  }

  try {
    const payload: PersistedBoardStore = {
      schemaVersion: 1,
      savedAt: now(),
      rooms: Array.from(rooms.values()).map(roomToPersisted)
    };
    const directory = path.dirname(persistencePath);
    const temporaryPath = `${persistencePath}.tmp`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, persistencePath);
    lastPersistedAt = payload.savedAt;
    lastPersistenceError = undefined;
  } catch (error) {
    lastPersistenceError = error instanceof Error ? error.message : "Board persistence failed";
  }
}

function databaseLabel() {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "postgres database";
  }
}

async function writePostgresRooms() {
  if (!postgresPool) {
    return;
  }

  const client = await postgresPool.connect();

  try {
    await client.query("BEGIN");

    for (const room of rooms.values()) {
      const persisted = roomToPersisted(room);
      await client.query(
        `
          INSERT INTO daedalus_board_rooms (
            room_id,
            board_name,
            classroom_id,
            owner_name,
            thumbnail_data_url,
            preferred_language,
            help_requested,
            objects,
            analyses,
            chat,
            comments,
            versions,
            version,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
          ON CONFLICT (room_id) DO UPDATE SET
            board_name = EXCLUDED.board_name,
            classroom_id = EXCLUDED.classroom_id,
            owner_name = EXCLUDED.owner_name,
            thumbnail_data_url = EXCLUDED.thumbnail_data_url,
            preferred_language = EXCLUDED.preferred_language,
            help_requested = EXCLUDED.help_requested,
            objects = EXCLUDED.objects,
            analyses = EXCLUDED.analyses,
            chat = EXCLUDED.chat,
            comments = EXCLUDED.comments,
            versions = EXCLUDED.versions,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at
        `,
        [
          persisted.roomId,
          persisted.boardName,
          persisted.classroomId ?? null,
          persisted.ownerName ?? null,
          persisted.thumbnailDataUrl ?? null,
          persisted.preferredLanguage ?? "en",
          persisted.helpRequested,
          JSON.stringify(persisted.objects),
          JSON.stringify(persisted.analyses),
          JSON.stringify(persisted.chat),
          JSON.stringify(persisted.comments),
          JSON.stringify(persisted.versions),
          persisted.version,
          persisted.updatedAt
        ]
      );
    }

    await client.query("COMMIT");
    lastPersistedAt = now();
    lastPersistenceError = undefined;
  } catch (error) {
    await client.query("ROLLBACK");
    lastPersistenceError = error instanceof Error ? error.message : "Postgres board persistence failed";
  } finally {
    client.release();
  }
}

async function flushPersistedRooms() {
  if (!persistenceEnabled) {
    return;
  }

  if (activePersistenceProvider === "postgres") {
    await writePostgresRooms();
    return;
  }

  writeFilePersistedRooms();
}

function schedulePersistence() {
  if (!persistenceEnabled) {
    return;
  }

  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }

  persistenceTimer = setTimeout(() => {
    persistenceTimer = undefined;
    void flushPersistedRooms();
  }, 250);
}

function hydrateRoom(candidate: Partial<PersistedBoardRoom>): BoardRoom | null {
  if (!candidate.roomId) {
    return null;
  }

  const objects = asArray<CanvasObjectPayload>(candidate.objects).filter((object) => typeof object.objectId === "string");

  return {
    roomId: candidate.roomId,
    boardName: candidate.boardName?.trim() || "Untitled board",
    classroomId: candidate.classroomId,
    ownerName: candidate.ownerName,
    thumbnailDataUrl:
      typeof candidate.thumbnailDataUrl === "string" && candidate.thumbnailDataUrl.startsWith("data:image/")
        ? candidate.thumbnailDataUrl
        : undefined,
    preferredLanguage: isLanguageCode(candidate.preferredLanguage) ? candidate.preferredLanguage : "en",
    helpRequested: Boolean(candidate.helpRequested),
    objects: new Map(objects.map((object) => [object.objectId, object])),
    participants: new Map(),
    participantConnections: new Map(),
    analyses: asArray<AnalysisResult>(candidate.analyses).slice(-30),
    chat: asArray<ChatMessage>(candidate.chat).slice(-100),
    comments: asArray<BoardComment>(candidate.comments).slice(-100),
    versions: asArray<BoardVersionSnapshot>(candidate.versions).slice(-10),
    version: typeof candidate.version === "number" ? candidate.version : 0,
    updatedAt: candidate.updatedAt ?? now()
  };
}

function loadPersistedRooms() {
  if (!persistenceEnabled || !existsSync(persistencePath)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(persistencePath, "utf8")) as Partial<PersistedBoardStore>;
    asArray<Partial<PersistedBoardRoom>>(parsed.rooms).forEach((candidate) => {
      const room = hydrateRoom(candidate);

      if (room) {
        rooms.set(room.roomId, room);
      }
    });
    lastPersistedAt = parsed.savedAt;
    lastPersistenceError = undefined;
  } catch (error) {
    lastPersistenceError = error instanceof Error ? error.message : "Could not load persisted boards";
  }
}

async function runPostgresMigrations(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daedalus_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = existsSync(migrationsPath)
    ? readdirSync(migrationsPath)
        .filter((fileName) => fileName.endsWith(".sql"))
        .sort()
    : [];

  for (const fileName of migrationFiles) {
    const migrationId = fileName.replace(/\.sql$/i, "");
    const existing = await pool.query("SELECT 1 FROM daedalus_schema_migrations WHERE id = $1", [migrationId]);

    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsPath, fileName), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO daedalus_schema_migrations (id) VALUES ($1)", [migrationId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function asIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value : now();
}

async function loadPostgresRooms() {
  if (!postgresPool) {
    return;
  }

  const result = await postgresPool.query<{
    room_id: string;
    board_name: string;
    classroom_id: string | null;
    owner_name: string | null;
    thumbnail_data_url: string | null;
    preferred_language: string | null;
    help_requested: boolean;
    objects: unknown;
    analyses: unknown;
    chat: unknown;
    comments: unknown;
    versions: unknown;
    version: number;
    updated_at: Date | string;
  }>(
    `
      SELECT
        room_id,
        board_name,
        classroom_id,
        owner_name,
        thumbnail_data_url,
        preferred_language,
        help_requested,
        objects,
        analyses,
        chat,
        comments,
        versions,
        version,
        updated_at
      FROM daedalus_board_rooms
      ORDER BY updated_at DESC
    `
  );

  result.rows.forEach((row) => {
    const room = hydrateRoom({
      roomId: row.room_id,
      boardName: row.board_name,
      classroomId: row.classroom_id ?? undefined,
      ownerName: row.owner_name ?? undefined,
      thumbnailDataUrl: row.thumbnail_data_url ?? undefined,
      preferredLanguage: row.preferred_language as LanguageCode,
      helpRequested: row.help_requested,
      objects: asArray<CanvasObjectPayload>(row.objects),
      analyses: asArray<AnalysisResult>(row.analyses),
      chat: asArray<ChatMessage>(row.chat),
      comments: asArray<BoardComment>(row.comments),
      versions: asArray<BoardVersionSnapshot>(row.versions),
      version: row.version,
      updatedAt: asIsoString(row.updated_at)
    });

    if (room) {
      rooms.set(room.roomId, room);
    }
  });

  lastPersistedAt = now();
  lastPersistenceError = undefined;
}

async function initializePostgresPersistence() {
  if (!persistenceEnabled || !databaseUrl) {
    return false;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  await pool.query("SELECT 1");
  await runPostgresMigrations(pool);
  postgresPool = pool;
  activePersistenceProvider = "postgres";
  await loadPostgresRooms();
  return true;
}

export async function initializeBoardStore() {
  if (!persistenceEnabled) {
    return;
  }

  if (databaseUrl) {
    try {
      await initializePostgresPersistence();
      return;
    } catch (error) {
      lastPersistenceError = error instanceof Error ? error.message : "Could not initialize Postgres board store";
      activePersistenceProvider = "file";
    }
  }

  loadPersistedRooms();
}

export function getOrCreateRoom(roomId: string): BoardRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const room: BoardRoom = {
    roomId,
    boardName: "Untitled board",
    preferredLanguage: "en",
    helpRequested: false,
    objects: new Map(),
    participants: new Map(),
    participantConnections: new Map(),
    analyses: [],
    chat: [],
    comments: [],
    versions: [],
    version: 0,
    updatedAt: now()
  };

  rooms.set(roomId, room);
  schedulePersistence();
  return room;
}

export function serializeRoom(room: BoardRoom): BoardSnapshot {
  return {
    roomId: room.roomId,
    boardName: room.boardName,
    classroomId: room.classroomId,
    ownerName: room.ownerName,
    thumbnailDataUrl: room.thumbnailDataUrl,
    preferredLanguage: room.preferredLanguage,
    helpRequested: room.helpRequested,
    objects: Array.from(room.objects.values()),
    version: room.version,
    updatedAt: room.updatedAt,
    participants: Array.from(room.participants.values()),
    analyses: room.analyses.slice(-10),
    chat: room.chat.slice(-50),
    comments: room.comments.slice(-100),
    versions: room.versions.slice(-10)
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
  room.versions = room.versions.slice(-10);
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
      thumbnailDataUrl: room.thumbnailDataUrl,
      preferredLanguage: room.preferredLanguage,
      helpRequested: room.helpRequested,
      objectCount: room.objects.size,
      commentCount: room.comments.filter((comment) => !comment.resolved).length,
      participantCount: room.participants.size,
      version: room.version,
      updatedAt: room.updatedAt,
      lastAnalysis: room.analyses.at(-1)
    }));
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

export function getSessionDebrief(classroomId?: string): SessionDebrief {
  const selectedRooms = Array.from(rooms.values()).filter((room) => !classroomId || room.classroomId === classroomId);
  const roomReports = selectedRooms.map((room) => ({
    room,
    analysis: room.analyses.at(-1),
    report: buildQualityReport(room)
  }));
  const averageQualityScore =
    roomReports.length > 0
      ? Math.round(roomReports.reduce((total, item) => total + item.report.score, 0) / roomReports.length)
      : 0;
  const typeCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();

  roomReports.forEach(({ analysis, room }) => {
    const type = analysis?.diagramType ?? "Unknown Diagram";
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    languageCounts.set(room.preferredLanguage, (languageCounts.get(room.preferredLanguage) ?? 0) + 1);
  });

  const commonTypes = Array.from(typeCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} (${count})`);
  const languages = Array.from(languageCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([language, count]) => `${language.toUpperCase()} (${count})`);
  const helpRooms = roomReports.filter(
    ({ room, report }) => room.helpRequested || report.grade === "blocked" || report.issueCount >= 3
  );
  const strongRooms = roomReports.filter(({ report }) => report.score >= 70).slice(0, 5);

  return {
    classroomId,
    generatedAt: now(),
    headline:
      selectedRooms.length === 0
        ? "No active boards are available for this session yet."
        : `${selectedRooms.length} boards reviewed with an average quality score of ${averageQualityScore}.`,
    themes: [
      commonTypes.length > 0 ? `Diagram mix: ${commonTypes.join(", ")}.` : "No diagram types have been identified yet.",
      `${selectedRooms.filter((room) => room.helpRequested).length} boards currently have an instructor help request.`,
      languages.length > 0
        ? `Preferred explanation languages: ${languages.join(", ")}.`
        : "All boards are using the default explanation language."
    ],
    instructorActions:
      selectedRooms.length === 0
        ? ["Create or join a classroom board before generating the debrief."]
        : [
            helpRooms.length > 0
              ? `Start with ${helpRooms.length} boards that are blocked, have several issues, or requested help.`
              : "Use the next review block to reinforce good notation patterns across the room.",
            averageQualityScore < 70
              ? "Run a short whole-class correction pass on connectors, labels, and notation consistency."
              : "Ask students to explain their strongest diagram decision before moving to the next exercise.",
            "Export the session summary when the review is complete so students can revisit feedback."
          ],
    studentGroupsNeedingHelp: helpRooms.slice(0, 8).map(({ room, report }) => ({
      roomId: room.roomId,
      boardName: room.boardName,
      reason: room.helpRequested
        ? "Student requested instructor help."
        : `${report.grade} quality grade with ${report.issueCount} AI-detected issues.`
    })),
    celebrationPoints:
      strongRooms.length > 0
        ? strongRooms.map(({ room, report }) => `${room.boardName} is at ${report.score} quality with clear structure.`)
        : ["Look for clear labels, connected relationships, and complete notation as boards mature."]
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
  schedulePersistence();
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
  schedulePersistence();
  return updated;
}

export function updateBoardMetadata(
  roomId: string,
  patch: Partial<Pick<BoardRoom, "boardName" | "classroomId" | "ownerName" | "preferredLanguage" | "helpRequested">>
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

  if (typeof patch.helpRequested === "boolean") {
    room.helpRequested = patch.helpRequested;
  }

  if (patch.preferredLanguage) {
    room.preferredLanguage = patch.preferredLanguage;
  }

  room.updatedAt = now();
  schedulePersistence();
  return serializeRoom(room);
}

export function getBoardLanguage(roomId: string): LanguageCode {
  return getOrCreateRoom(roomId).preferredLanguage;
}

export function getLatestAnalysis(roomId: string): AnalysisResult | undefined {
  return getOrCreateRoom(roomId).analyses.at(-1);
}

export function getStorageStatus(): StorageStatus {
  return {
    provider: activePersistenceProvider,
    persistent: persistenceEnabled,
    roomCount: rooms.size,
    path:
      activePersistenceProvider === "postgres"
        ? databaseLabel()
        : activePersistenceProvider === "file"
          ? persistencePath
          : undefined,
    lastPersistedAt,
    lastError: lastPersistenceError
  };
}

export function getRoomVersions(roomId: string): BoardVersionSnapshot[] {
  return getOrCreateRoom(roomId).versions.slice(-10);
}

export function createNamedCheckpoint(roomId: string, label: string): BoardVersionSnapshot {
  const room = getOrCreateRoom(roomId);
  const snapshot = createVersionSnapshot(room, label.trim());
  room.updatedAt = now();
  schedulePersistence();
  return snapshot;
}

export function updateBoardThumbnail(roomId: string, thumbnailDataUrl: string): BoardSnapshot {
  const room = getOrCreateRoom(roomId);
  room.thumbnailDataUrl = thumbnailDataUrl;
  room.updatedAt = now();
  schedulePersistence();
  return serializeRoom(room);
}

export function restoreRoomVersion(roomId: string, snapshotId: string, userId: string, clientId?: string): CanvasOperation | null {
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
  schedulePersistence();

  return {
    type: "replace",
    userId,
    clientId,
    boardVersion: room.version,
    objects: Array.from(room.objects.values())
  };
}

export function joinParticipant(roomId: string, participant: Participant, connectionId?: string): Participant {
  const room = getOrCreateRoom(roomId);
  const existing = room.participants.get(participant.id);
  const merged: Participant = {
    ...participant,
    joinedAt: existing?.joinedAt ?? participant.joinedAt,
    online: true,
    lastActiveAt: now()
  };

  room.participants.set(participant.id, merged);
  if (connectionId) {
    const connections = room.participantConnections.get(participant.id) ?? new Set<string>();
    connections.add(connectionId);
    room.participantConnections.set(participant.id, connections);
  }
  room.ownerName = room.ownerName ?? participant.name;
  room.updatedAt = now();
  schedulePersistence();
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

export function removeParticipant(roomId: string, participantId: string, connectionId?: string): Participant | null {
  const room = rooms.get(roomId);

  if (!room) {
    return null;
  }

  const participant = room.participants.get(participantId);

  if (!participant) {
    return null;
  }

  const connections = room.participantConnections.get(participantId);

  if (connections && connectionId) {
    connections.delete(connectionId);

    if (connections.size > 0) {
      room.participants.set(participantId, {
        ...participant,
        online: true,
        lastActiveAt: now()
      });
      room.updatedAt = now();
      return null;
    }
  }

  room.participantConnections.delete(participantId);
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
  const boardVersion = room.version + 1;
  room.version = boardVersion;
  room.updatedAt = now();

  if (operation.type === "upsert") {
    room.objects.set(operation.object.objectId, operation.object);
    createVersionSnapshot(room, `Version ${boardVersion}`);
    schedulePersistence();
    return {
      ...operation,
      boardVersion
    };
  }

  if (operation.type === "delete") {
    room.objects.delete(operation.objectId);
    createVersionSnapshot(room, `Version ${boardVersion}`);
    schedulePersistence();
    return {
      ...operation,
      boardVersion
    };
  }

  if (operation.type === "replace") {
    room.objects.clear();
    operation.objects.forEach((object) => room.objects.set(object.objectId, object));
    createVersionSnapshot(room, `Version ${boardVersion}`);
    schedulePersistence();
    return {
      ...operation,
      boardVersion
    };
  }

  room.objects.clear();
  createVersionSnapshot(room, `Version ${boardVersion}`);
  schedulePersistence();
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
  schedulePersistence();
  return analysis;
}

export function addChatMessage(roomId: string, message: ChatMessage): ChatMessage {
  const room = getOrCreateRoom(roomId);
  room.chat.push(message);
  room.chat = room.chat.slice(-100);
  room.updatedAt = now();
  schedulePersistence();
  return message;
}

export function getRoomObjects(roomId: string): CanvasObjectPayload[] {
  return Array.from(getOrCreateRoom(roomId).objects.values());
}

process.on("beforeExit", () => {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
    persistenceTimer = undefined;
  }

  void flushPersistedRooms();
});
