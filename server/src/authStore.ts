import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AuthRole,
  AuthSession,
  AuthUser,
  CollaborationRoom,
  RoomAccess,
  RoomInvite,
  RoomMemberRole,
  RoomMembership,
  RoomVisibility
} from "../../shared/src/types";

const USER_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0f766e", "#dc2626"];

interface PersistedAuthStore {
  schemaVersion: 1;
  savedAt: string;
  users: AuthUser[];
  sessions: AuthSession[];
  rooms: CollaborationRoom[];
  memberships?: RoomMembership[];
  invites?: RoomInvite[];
}

const authStorePath = process.env.AUTH_STORE_PATH?.trim() || path.join(process.cwd(), "data", "auth.snapshot.json");
const users = new Map<string, AuthUser>();
const userIdsByLogin = new Map<string, string>();
const sessions = new Map<string, AuthSession>();
const rooms = new Map<string, CollaborationRoom>();
const memberships = new Map<string, RoomMembership>();
const invites = new Map<string, RoomInvite>();

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let lastError: string | undefined;

const now = () => new Date().toISOString();

function normalizeLogin(email: string | undefined, name: string) {
  return (email?.trim().toLowerCase() || name.trim().toLowerCase()).replace(/\s+/g, " ");
}

function normalizeRole(role: unknown): AuthRole {
  return role === "student" || role === "instructor" || role === "user" ? role : "student";
}

function normalizeMemberRole(role: unknown): RoomMemberRole {
  return role === "owner" || role === "editor" || role === "viewer" || role === "instructor" ? role : "viewer";
}

function normalizeVisibility(visibility: unknown): RoomVisibility {
  return visibility === "public" ? "public" : "private";
}

function membershipKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

function inviteCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function persistAuthStore() {
  try {
    const payload: PersistedAuthStore = {
      schemaVersion: 1,
      savedAt: now(),
      users: Array.from(users.values()),
      sessions: Array.from(sessions.values()),
      rooms: Array.from(rooms.values()),
      memberships: Array.from(memberships.values()),
      invites: Array.from(invites.values())
    };
    const directory = path.dirname(authStorePath);
    const temporaryPath = `${authStorePath}.tmp`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, authStorePath);
    lastError = undefined;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not persist auth store";
  }
}

function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistAuthStore();
  }, 250);
}

function indexUser(user: AuthUser) {
  users.set(user.id, user);
  userIdsByLogin.set(normalizeLogin(user.email, user.name), user.id);
}

function publicRoom(room: CollaborationRoom, userId?: string): CollaborationRoom {
  const memberCount = Array.from(memberships.values()).filter((member) => member.roomId === room.roomId).length;
  const membership = userId ? memberships.get(membershipKey(room.roomId, userId)) : undefined;
  return {
    ...room,
    memberRole: membership?.role,
    memberCount
  };
}

function upsertMembership(input: {
  roomId: string;
  userId: string;
  userName: string;
  role: RoomMemberRole;
  invitedBy?: string;
}): RoomMembership {
  const key = membershipKey(input.roomId, input.userId);
  const existing = memberships.get(key);
  const timestamp = now();
  const membership: RoomMembership = {
    roomId: input.roomId,
    userId: input.userId,
    userName: input.userName,
    role: input.role,
    invitedBy: input.invitedBy ?? existing?.invitedBy,
    joinedAt: existing?.joinedAt ?? timestamp,
    updatedAt: timestamp
  };

  memberships.set(key, membership);
  return membership;
}

function loadAuthStore() {
  if (!existsSync(authStorePath)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(authStorePath, "utf8")) as Partial<PersistedAuthStore>;

    if (Array.isArray(parsed.users)) {
      parsed.users.forEach((user) => {
        if (user.id && user.name) {
          indexUser({
            ...user,
            role: normalizeRole(user.role),
            color: user.color || USER_COLORS[users.size % USER_COLORS.length],
            createdAt: user.createdAt || now(),
            lastLoginAt: user.lastLoginAt || now()
          });
        }
      });
    }

    if (Array.isArray(parsed.sessions)) {
      parsed.sessions.forEach((session) => {
        if (session.token && session.user?.id && users.has(session.user.id)) {
          sessions.set(session.token, {
            ...session,
            user: users.get(session.user.id) ?? session.user
          });
        }
      });
    }

    if (Array.isArray(parsed.rooms)) {
      parsed.rooms.forEach((room) => {
        if (room.roomId && room.ownerId) {
          rooms.set(room.roomId, {
            ...room,
            visibility: normalizeVisibility(room.visibility),
            createdAt: room.createdAt || now(),
            updatedAt: room.updatedAt || now()
          });
        }
      });
    }

    if (Array.isArray(parsed.memberships)) {
      parsed.memberships.forEach((membership) => {
        if (membership.roomId && membership.userId && rooms.has(membership.roomId)) {
          memberships.set(membershipKey(membership.roomId, membership.userId), {
            ...membership,
            role: normalizeMemberRole(membership.role),
            joinedAt: membership.joinedAt || now(),
            updatedAt: membership.updatedAt || now()
          });
        }
      });
    }

    rooms.forEach((room) => {
      if (!memberships.has(membershipKey(room.roomId, room.ownerId))) {
        upsertMembership({
          roomId: room.roomId,
          userId: room.ownerId,
          userName: room.ownerName,
          role: "owner"
        });
      }
    });

    if (Array.isArray(parsed.invites)) {
      parsed.invites.forEach((invite) => {
        if (invite.code && invite.roomId && rooms.has(invite.roomId)) {
          invites.set(invite.code, {
            ...invite,
            role: invite.role === "editor" || invite.role === "viewer" || invite.role === "instructor" ? invite.role : "viewer"
          });
        }
      });
    }

    lastError = undefined;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not load auth store";
  }
}

export function loginUser(input: { name: string; email?: string; role?: AuthRole }): AuthSession {
  const name = input.name.trim();
  const email = input.email?.trim() || undefined;
  const loginKey = normalizeLogin(email, name);
  const existingId = userIdsByLogin.get(loginKey);
  const timestamp = now();
  const existingUser = existingId ? users.get(existingId) : undefined;
  const user: AuthUser = existingUser
    ? {
        ...existingUser,
        name,
        email,
        role: normalizeRole(input.role ?? existingUser.role),
        lastLoginAt: timestamp
      }
    : {
        id: crypto.randomUUID(),
        name,
        email,
        role: normalizeRole(input.role),
        color: USER_COLORS[users.size % USER_COLORS.length],
        createdAt: timestamp,
        lastLoginAt: timestamp
      };
  const session: AuthSession = {
    token: crypto.randomUUID(),
    user,
    createdAt: timestamp
  };

  indexUser(user);
  sessions.set(session.token, session);
  schedulePersist();
  return session;
}

export function getSession(token: string | undefined): AuthSession | undefined {
  if (!token) {
    return undefined;
  }

  const session = sessions.get(token);

  if (!session) {
    return undefined;
  }

  const user = users.get(session.user.id);
  return user ? { ...session, user } : undefined;
}

export function logoutSession(token: string | undefined) {
  if (!token) {
    return;
  }

  sessions.delete(token);
  schedulePersist();
}

export function createCollaborationRoom(input: {
  name: string;
  classroomId?: string;
  owner: AuthUser;
  visibility?: RoomVisibility;
}): CollaborationRoom {
  const timestamp = now();
  const room: CollaborationRoom = {
    roomId: crypto.randomUUID().slice(0, 8),
    name: input.name.trim() || "Untitled room",
    classroomId: input.classroomId?.trim() || undefined,
    ownerId: input.owner.id,
    ownerName: input.owner.name,
    visibility: normalizeVisibility(input.visibility),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  rooms.set(room.roomId, room);
  upsertMembership({
    roomId: room.roomId,
    userId: input.owner.id,
    userName: input.owner.name,
    role: "owner"
  });
  schedulePersist();
  return publicRoom(room, input.owner.id);
}

export function listRoomsForUser(userId: string): CollaborationRoom[] {
  const visibleRoomIds = new Set(
    Array.from(memberships.values())
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.roomId)
  );

  return Array.from(rooms.values())
    .filter((room) => !room.archivedAt)
    .filter((room) => room.visibility === "public" || visibleRoomIds.has(room.roomId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((room) => publicRoom(room, userId));
}

export function getCollaborationRoom(roomId: string): CollaborationRoom | undefined {
  const room = rooms.get(roomId);
  return room ? publicRoom(room) : undefined;
}

export function touchCollaborationRoom(
  roomId: string,
  patch: Partial<Pick<CollaborationRoom, "name" | "classroomId" | "visibility">>
) {
  const existing = rooms.get(roomId);

  if (!existing) {
    return;
  }

  rooms.set(roomId, {
    ...existing,
    name: patch.name?.trim() || existing.name,
    classroomId: typeof patch.classroomId === "string" ? patch.classroomId.trim() || undefined : existing.classroomId,
    visibility: patch.visibility ? normalizeVisibility(patch.visibility) : existing.visibility,
    updatedAt: now()
  });
  schedulePersist();
}

export function renameRoom(roomId: string, name: string, user: AuthUser): CollaborationRoom | undefined {
  if (!canManageRoom(roomId, user.id)) {
    return undefined;
  }

  touchCollaborationRoom(roomId, { name });
  const room = rooms.get(roomId);
  return room ? publicRoom(room, user.id) : undefined;
}

export function updateRoomVisibility(roomId: string, visibility: RoomVisibility, user: AuthUser): CollaborationRoom | undefined {
  if (!canManageRoom(roomId, user.id)) {
    return undefined;
  }

  touchCollaborationRoom(roomId, { visibility });
  const room = rooms.get(roomId);
  return room ? publicRoom(room, user.id) : undefined;
}

export function updateRoomDetails(
  roomId: string,
  patch: Partial<Pick<CollaborationRoom, "name" | "classroomId" | "visibility">>,
  user: AuthUser
): CollaborationRoom | undefined {
  if (!canManageRoom(roomId, user.id)) {
    return undefined;
  }

  touchCollaborationRoom(roomId, patch);
  const room = rooms.get(roomId);
  return room ? publicRoom(room, user.id) : undefined;
}

export function archiveRoom(roomId: string, user: AuthUser): CollaborationRoom | undefined {
  const existing = rooms.get(roomId);

  if (!existing || !canManageRoom(roomId, user.id)) {
    return undefined;
  }

  const room = {
    ...existing,
    archivedAt: now(),
    updatedAt: now()
  };
  rooms.set(roomId, room);
  schedulePersist();
  return publicRoom(room, user.id);
}

export function getRoomMembership(roomId: string, userId: string): RoomMembership | undefined {
  return memberships.get(membershipKey(roomId, userId));
}

export function canAccessRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);

  if (!room || room.archivedAt) {
    return false;
  }

  return room.visibility === "public" || memberships.has(membershipKey(roomId, userId));
}

export function canEditRoom(roomId: string, userId: string) {
  const role = getRoomMembership(roomId, userId)?.role;
  return role === "owner" || role === "editor" || role === "instructor";
}

export function canManageRoom(roomId: string, userId: string) {
  const role = getRoomMembership(roomId, userId)?.role;
  return role === "owner" || role === "instructor";
}

export function accessRoom(roomId: string, user: AuthUser): RoomAccess | undefined {
  const room = rooms.get(roomId);

  if (!room || room.archivedAt) {
    return undefined;
  }

  let membership = getRoomMembership(roomId, user.id);

  if (!membership && room.visibility === "public") {
    membership = upsertMembership({
      roomId,
      userId: user.id,
      userName: user.name,
      role: "viewer"
    });
    schedulePersist();
  }

  return membership ? { room: publicRoom(room, user.id), membership } : undefined;
}

export function createRoomInvite(input: {
  roomId: string;
  role: Exclude<RoomMemberRole, "owner">;
  createdBy: AuthUser;
}): RoomInvite | undefined {
  if (!canManageRoom(input.roomId, input.createdBy.id)) {
    return undefined;
  }

  const invite: RoomInvite = {
    code: inviteCode(),
    roomId: input.roomId,
    role: input.role,
    createdBy: input.createdBy.id,
    createdAt: now()
  };

  invites.set(invite.code, invite);
  schedulePersist();
  return invite;
}

export function acceptRoomInvite(code: string, user: AuthUser): RoomAccess | undefined {
  const invite = invites.get(code);
  const room = invite ? rooms.get(invite.roomId) : undefined;

  if (!invite || invite.revokedAt || !room || room.archivedAt) {
    return undefined;
  }

  const membership = upsertMembership({
    roomId: invite.roomId,
    userId: user.id,
    userName: user.name,
    role: invite.role,
    invitedBy: invite.createdBy
  });
  schedulePersist();
  return { room: publicRoom(room, user.id), membership };
}

export function listRoomMembers(roomId: string, user: AuthUser): RoomMembership[] | undefined {
  if (!canAccessRoom(roomId, user.id)) {
    return undefined;
  }

  return Array.from(memberships.values())
    .filter((membership) => membership.roomId === roomId)
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
}

export function updateRoomMemberRole(
  roomId: string,
  targetUserId: string,
  role: Exclude<RoomMemberRole, "owner">,
  user: AuthUser
): RoomMembership[] | undefined {
  if (!canManageRoom(roomId, user.id)) {
    return undefined;
  }

  const key = membershipKey(roomId, targetUserId);
  const existing = memberships.get(key);

  if (!existing || existing.role === "owner") {
    return undefined;
  }

  memberships.set(key, {
    ...existing,
    role,
    updatedAt: now()
  });
  schedulePersist();
  return listRoomMembers(roomId, user);
}

export function removeRoomMember(roomId: string, targetUserId: string, user: AuthUser): RoomMembership[] | undefined {
  if (!canManageRoom(roomId, user.id)) {
    return undefined;
  }

  const key = membershipKey(roomId, targetUserId);
  const existing = memberships.get(key);

  if (!existing || existing.role === "owner") {
    return undefined;
  }

  memberships.delete(key);
  schedulePersist();
  return listRoomMembers(roomId, user);
}

export function getAuthStoreStatus() {
  return {
    path: authStorePath,
    userCount: users.size,
    roomCount: rooms.size,
    membershipCount: memberships.size,
    inviteCount: invites.size,
    lastError
  };
}

loadAuthStore();

process.on("beforeExit", () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }

  persistAuthStore();
});
