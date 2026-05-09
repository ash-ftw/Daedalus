import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type { BoardPersistence, PersistedBoardRoom } from "./types";
import type { ObjectStorage } from "./objectStorage";

const { Pool } = pg;

interface SnapshotFile {
  schemaVersion: 1;
  savedAt: string;
  rooms: PersistedBoardRoom[];
}

class MemoryBoardPersistence implements BoardPersistence {
  status = {
    name: "memory",
    configured: true,
    durable: false
  };

  async initialize() {
    return;
  }

  async loadRooms() {
    return [];
  }

  async saveRoom() {
    return;
  }
}

class FileBoardPersistence implements BoardPersistence {
  status = {
    name: "file",
    configured: true,
    durable: true
  };

  private readonly filePath: string;
  private readonly rooms = new Map<string, PersistedBoardRoom>();
  private writeQueue = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async loadRooms() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const snapshot = JSON.parse(raw) as SnapshotFile;
      const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms.map(normalizeRoom) : [];
      this.rooms.clear();
      rooms.forEach((room) => this.rooms.set(room.roomId, room));
      return rooms;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async saveRoom(room: PersistedBoardRoom) {
    this.rooms.set(room.roomId, normalizeRoom(room));
    this.writeQueue = this.writeQueue.then(() => this.flush());
    await this.writeQueue;
  }

  private async flush() {
    const snapshot: SnapshotFile = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      rooms: Array.from(this.rooms.values()).sort((left, right) => left.roomId.localeCompare(right.roomId))
    };
    const tmpPath = `${this.filePath}.tmp`;

    await writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

class PostgresBoardPersistence implements BoardPersistence {
  status = {
    name: "postgres",
    configured: true,
    durable: true
  };

  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS board_rooms (
        room_id text PRIMARY KEY,
        board_name text NOT NULL,
        classroom_id text,
        owner_name text,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        help_requested boolean NOT NULL DEFAULT false,
        objects jsonb NOT NULL DEFAULT '[]'::jsonb,
        analyses jsonb NOT NULL DEFAULT '[]'::jsonb,
        chat jsonb NOT NULL DEFAULT '[]'::jsonb,
        comments jsonb NOT NULL DEFAULT '[]'::jsonb,
        versions jsonb NOT NULL DEFAULT '[]'::jsonb,
        version integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL
      )
    `);
    await this.pool.query("ALTER TABLE board_rooms ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb");
    await this.pool.query("CREATE INDEX IF NOT EXISTS board_rooms_classroom_updated_idx ON board_rooms (classroom_id, updated_at DESC)");
  }

  async loadRooms() {
    const result = await this.pool.query<{
      room_id: string;
      board_name: string;
      classroom_id: string | null;
      owner_name: string | null;
      tags: unknown;
      help_requested: boolean;
      objects: unknown;
      analyses: unknown;
      chat: unknown;
      comments: unknown;
      versions: unknown;
      version: number;
      updated_at: Date | string;
    }>(`
      SELECT room_id, board_name, classroom_id, owner_name, tags, help_requested,
        objects, analyses, chat, comments, versions, version, updated_at
      FROM board_rooms
      ORDER BY updated_at DESC
    `);

    return result.rows.map((row) =>
      normalizeRoom({
        roomId: row.room_id,
        boardName: row.board_name,
        classroomId: row.classroom_id ?? undefined,
        ownerName: row.owner_name ?? undefined,
        tags: jsonArray(row.tags).filter((tag): tag is string => typeof tag === "string"),
        helpRequested: row.help_requested,
        objects: jsonArray(row.objects),
        analyses: jsonArray(row.analyses),
        chat: jsonArray(row.chat),
        comments: jsonArray(row.comments),
        versions: jsonArray(row.versions),
        version: row.version,
        updatedAt: new Date(row.updated_at).toISOString()
      })
    );
  }

  async saveRoom(room: PersistedBoardRoom) {
    const normalized = normalizeRoom(room);

    await this.pool.query(
      `
        INSERT INTO board_rooms (
          room_id, board_name, classroom_id, owner_name, tags, help_requested,
          objects, analyses, chat, comments, versions, version, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13)
        ON CONFLICT (room_id) DO UPDATE SET
          board_name = EXCLUDED.board_name,
          classroom_id = EXCLUDED.classroom_id,
          owner_name = EXCLUDED.owner_name,
          tags = EXCLUDED.tags,
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
        normalized.roomId,
        normalized.boardName,
        normalized.classroomId ?? null,
        normalized.ownerName ?? null,
        JSON.stringify(normalized.tags),
        normalized.helpRequested,
        JSON.stringify(normalized.objects),
        JSON.stringify(normalized.analyses),
        JSON.stringify(normalized.chat),
        JSON.stringify(normalized.comments),
        JSON.stringify(normalized.versions),
        normalized.version,
        normalized.updatedAt
      ]
    );
  }
}

class ArchivingBoardPersistence implements BoardPersistence {
  status;

  constructor(
    private readonly primary: BoardPersistence,
    private readonly objectStorage: ObjectStorage
  ) {
    this.status = primary.status;
  }

  async initialize() {
    await this.primary.initialize();
  }

  async loadRooms() {
    return this.primary.loadRooms();
  }

  async saveRoom(room: PersistedBoardRoom) {
    await this.primary.saveRoom(room);

    if (!this.objectStorage.status.configured) {
      return;
    }

    try {
      await this.objectStorage.putJson(`boards/${encodeURIComponent(room.roomId)}/latest.json`, room);

      const latestVersion = room.versions.at(-1);
      if (latestVersion) {
        await this.objectStorage.putJson(
          `boards/${encodeURIComponent(room.roomId)}/versions/${latestVersion.id}.json`,
          latestVersion
        );
      }
    } catch (error) {
      console.error("Object storage archive failed", error);
    }
  }
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeRoom(room: PersistedBoardRoom): PersistedBoardRoom {
  return {
    roomId: room.roomId,
    boardName: room.boardName || "Untitled board",
    classroomId: room.classroomId,
    ownerName: room.ownerName,
    tags: jsonArray(room.tags).filter((tag): tag is string => typeof tag === "string"),
    helpRequested: Boolean(room.helpRequested),
    objects: jsonArray(room.objects),
    analyses: jsonArray(room.analyses),
    chat: jsonArray(room.chat),
    comments: jsonArray(room.comments),
    versions: jsonArray(room.versions).slice(-30),
    version: Number.isFinite(room.version) ? room.version : 0,
    updatedAt: room.updatedAt || new Date().toISOString()
  };
}

export function createBoardPersistenceFromEnv(objectStorage: ObjectStorage, env = process.env): BoardPersistence {
  const mode = (env.BOARD_STORAGE ?? "file").toLowerCase();
  const primary =
    mode === "postgres"
      ? new PostgresBoardPersistence(requireDatabaseUrl(env))
      : mode === "memory"
        ? new MemoryBoardPersistence()
        : new FileBoardPersistence(env.BOARD_SNAPSHOT_PATH ?? "data/boards.snapshot.json");

  return new ArchivingBoardPersistence(primary, objectStorage);
}

function requireDatabaseUrl(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when BOARD_STORAGE=postgres");
  }

  return env.DATABASE_URL;
}
