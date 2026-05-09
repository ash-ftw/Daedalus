import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import pg from "pg";
import type { ParticipantRole } from "../../../shared/src/types";

const { Pool } = pg;

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  role: Extract<ParticipantRole, "owner" | "instructor">;
  provider?: "password" | "google" | "microsoft";
  providerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
}

export interface BoardGrant {
  roomId: string;
  userId: string;
  role: ParticipantRole;
  createdAt: string;
}

interface AuthSnapshot {
  schemaVersion: 1;
  savedAt: string;
  users: UserAccount[];
  sessions: RefreshSession[];
  grants: BoardGrant[];
}

interface AuthStoreAdapter {
  initialize(): Promise<AuthSnapshot>;
  save(snapshot: AuthSnapshot): Promise<void>;
}

class FileAuthStoreAdapter implements AuthStoreAdapter {
  private readonly filePath: string;
  private writeQueue = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeSnapshot(JSON.parse(raw) as AuthSnapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptySnapshot();
      }

      throw error;
    }
  }

  async save(snapshot: AuthSnapshot) {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmpPath = `${this.filePath}.tmp`;
      await writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await rename(tmpPath, this.filePath);
    });
    await this.writeQueue;
  }
}

class MemoryAuthStoreAdapter implements AuthStoreAdapter {
  async initialize() {
    return emptySnapshot();
  }

  async save() {
    return;
  }
}

class PostgresAuthStoreAdapter implements AuthStoreAdapter {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id text PRIMARY KEY,
        email text UNIQUE NOT NULL,
        name text NOT NULL,
        password_hash text,
        role text NOT NULL,
        provider text,
        provider_id text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        revoked_at timestamptz
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS board_grants (
        room_id text NOT NULL,
        user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (room_id, user_id)
      )
    `);

    const [users, sessions, grants] = await Promise.all([
      this.pool.query<UserAccount>(
        "SELECT id, email, name, password_hash as \"passwordHash\", role, provider, provider_id as \"providerId\", created_at as \"createdAt\", updated_at as \"updatedAt\" FROM auth_users"
      ),
      this.pool.query<RefreshSession>(
        "SELECT id, user_id as \"userId\", token_hash as \"tokenHash\", expires_at as \"expiresAt\", created_at as \"createdAt\", revoked_at as \"revokedAt\" FROM auth_refresh_sessions"
      ),
      this.pool.query<BoardGrant>(
        "SELECT room_id as \"roomId\", user_id as \"userId\", role, created_at as \"createdAt\" FROM board_grants"
      )
    ]);

    return normalizeSnapshot({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      users: users.rows,
      sessions: sessions.rows,
      grants: grants.rows
    });
  }

  async save(snapshot: AuthSnapshot) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM board_grants");
      await client.query("DELETE FROM auth_refresh_sessions");
      await client.query("DELETE FROM auth_users");

      for (const user of snapshot.users) {
        await client.query(
          `INSERT INTO auth_users (id, email, name, password_hash, role, provider, provider_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [user.id, user.email, user.name, user.passwordHash ?? null, user.role, user.provider ?? null, user.providerId ?? null, user.createdAt, user.updatedAt]
        );
      }

      for (const session of snapshot.sessions) {
        await client.query(
          `INSERT INTO auth_refresh_sessions (id, user_id, token_hash, expires_at, created_at, revoked_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt, session.revokedAt ?? null]
        );
      }

      for (const grant of snapshot.grants) {
        await client.query(
          `INSERT INTO board_grants (room_id, user_id, role, created_at)
           VALUES ($1, $2, $3, $4)`,
          [grant.roomId, grant.userId, grant.role, grant.createdAt]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

class AuthStore {
  private users = new Map<string, UserAccount>();
  private usersByEmail = new Map<string, UserAccount>();
  private sessions = new Map<string, RefreshSession>();
  private grants = new Map<string, BoardGrant>();
  private adapter: AuthStoreAdapter = new MemoryAuthStoreAdapter();

  async initialize(adapter: AuthStoreAdapter) {
    this.adapter = adapter;
    this.applySnapshot(await adapter.initialize());
  }

  status() {
    return {
      users: this.users.size,
      grants: this.grants.size,
      sessions: Array.from(this.sessions.values()).filter((session) => !session.revokedAt).length
    };
  }

  async createPasswordUser(input: { email: string; name: string; password: string; role?: Extract<ParticipantRole, "owner" | "instructor"> }) {
    const email = input.email.trim().toLowerCase();
    if (this.usersByEmail.has(email)) {
      throw new Error("An account with this email already exists");
    }

    const now = new Date().toISOString();
    const user: UserAccount = {
      id: crypto.randomUUID(),
      email,
      name: input.name.trim(),
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role ?? "owner",
      provider: "password",
      createdAt: now,
      updatedAt: now
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    await this.persist();
    return user;
  }

  async upsertOAuthUser(input: { email: string; name: string; provider: "google" | "microsoft"; providerId: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = this.usersByEmail.get(email);
    const now = new Date().toISOString();

    if (existing) {
      const updated: UserAccount = {
        ...existing,
        name: input.name || existing.name,
        provider: input.provider,
        providerId: input.providerId,
        updatedAt: now
      };
      this.users.set(updated.id, updated);
      this.usersByEmail.set(updated.email, updated);
      await this.persist();
      return updated;
    }

    const user: UserAccount = {
      id: crypto.randomUUID(),
      email,
      name: input.name,
      role: "owner",
      provider: input.provider,
      providerId: input.providerId,
      createdAt: now,
      updatedAt: now
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    await this.persist();
    return user;
  }

  async verifyPassword(email: string, password: string) {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    if (!user?.passwordHash) {
      return null;
    }

    return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
  }

  findUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  findUserByEmail(email: string) {
    return this.usersByEmail.get(email.trim().toLowerCase()) ?? null;
  }

  async createRefreshSession(userId: string, token: string, ttlSeconds: number) {
    const now = new Date();
    const session: RefreshSession = {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      createdAt: now.toISOString()
    };

    this.sessions.set(session.id, session);
    await this.persist();
    return session;
  }

  async consumeRefreshToken(token: string) {
    const tokenHash = hashToken(token);
    const session = Array.from(this.sessions.values()).find((candidate) => candidate.tokenHash === tokenHash && !candidate.revokedAt);

    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      return null;
    }

    session.revokedAt = new Date().toISOString();
    await this.persist();
    return this.users.get(session.userId) ?? null;
  }

  async grantBoard(roomId: string, userId: string, role: ParticipantRole) {
    const grant: BoardGrant = {
      roomId,
      userId,
      role,
      createdAt: new Date().toISOString()
    };

    this.grants.set(grantKey(roomId, userId), grant);
    await this.persist();
    return grant;
  }

  boardRole(roomId: string, userId: string) {
    return this.grants.get(grantKey(roomId, userId))?.role ?? null;
  }

  accessibleRoomIds(userId: string) {
    return Array.from(this.grants.values())
      .filter((grant) => grant.userId === userId)
      .map((grant) => grant.roomId);
  }

  private applySnapshot(snapshot: AuthSnapshot) {
    this.users = new Map(snapshot.users.map((user) => [user.id, user]));
    this.usersByEmail = new Map(snapshot.users.map((user) => [user.email, user]));
    this.sessions = new Map(snapshot.sessions.map((session) => [session.id, session]));
    this.grants = new Map(snapshot.grants.map((grant) => [grantKey(grant.roomId, grant.userId), grant]));
  }

  private async persist() {
    await this.adapter.save({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      users: Array.from(this.users.values()),
      sessions: Array.from(this.sessions.values()),
      grants: Array.from(this.grants.values())
    });
  }
}

export const authStore = new AuthStore();

export async function configureAuthStoreFromEnv(env = process.env) {
  const mode = (env.AUTH_STORAGE ?? env.BOARD_STORAGE ?? "file").toLowerCase();
  const adapter =
    mode === "postgres"
      ? new PostgresAuthStoreAdapter(requireDatabaseUrl(env))
      : mode === "memory"
        ? new MemoryAuthStoreAdapter()
        : new FileAuthStoreAdapter(env.AUTH_SNAPSHOT_PATH ?? "data/auth.snapshot.json");

  await authStore.initialize(adapter);
}

function normalizeSnapshot(snapshot: AuthSnapshot): AuthSnapshot {
  return {
    schemaVersion: 1,
    savedAt: snapshot.savedAt ?? new Date().toISOString(),
    users: Array.isArray(snapshot.users) ? snapshot.users : [],
    sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
    grants: Array.isArray(snapshot.grants) ? snapshot.grants : []
  };
}

function emptySnapshot(): AuthSnapshot {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    users: [],
    sessions: [],
    grants: []
  };
}

function grantKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requireDatabaseUrl(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when AUTH_STORAGE=postgres");
  }

  return env.DATABASE_URL;
}
