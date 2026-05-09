import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { Socket } from "socket.io";
import type { Participant, ParticipantRole } from "../../../shared/src/types";
import { signToken, verifyToken, type AuthPrincipal } from "./tokens";
import { authStore, type UserAccount } from "./userStore";

export type BoardAction = "read" | "comment" | "write" | "manage" | "instructor";

interface AuthConfig {
  required: boolean;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  guestTokenTtlSeconds: number;
  inviteSecret?: string;
}

const rolePermissions: Record<ParticipantRole, BoardAction[]> = {
  viewer: ["read"],
  editor: ["read", "comment", "write"],
  owner: ["read", "comment", "write", "manage"],
  instructor: ["read", "comment", "write", "manage", "instructor"]
};

export const authConfig: AuthConfig = {
  required: process.env.AUTH_REQUIRED === "true",
  jwtSecret: process.env.AUTH_JWT_SECRET || "dev-only-change-me",
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 60 * 15),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30),
  guestTokenTtlSeconds: Number(process.env.GUEST_TOKEN_TTL_SECONDS ?? 60 * 60 * 24),
  inviteSecret: process.env.AUTH_INVITE_SECRET
};

export function authStatus() {
  return {
    required: authConfig.required,
    guestTokens: true,
    inviteSecretConfigured: Boolean(authConfig.inviteSecret),
    accessTokenTtlSeconds: authConfig.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: authConfig.refreshTokenTtlSeconds,
    accounts: authStore.status()
  };
}

export async function issueUserTokens(user: UserAccount) {
  const refreshToken = crypto.randomUUID();
  await authStore.createRefreshSession(user.id, refreshToken, authConfig.refreshTokenTtlSeconds);

  return {
    accessToken: signToken(
      {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        type: "user"
      },
      authConfig.jwtSecret,
      authConfig.accessTokenTtlSeconds
    ),
    refreshToken,
    expiresInSeconds: authConfig.accessTokenTtlSeconds,
    user: publicUser(user)
  };
}

export function issueGuestToken(input: { roomId: string; name: string; role: Extract<ParticipantRole, "viewer" | "editor"> }) {
  return signToken(
    {
      sub: `guest:${crypto.randomUUID()}`,
      name: input.name,
      role: input.role,
      roomId: input.roomId,
      type: "guest"
    },
    authConfig.jwtSecret,
    authConfig.guestTokenTtlSeconds
  );
}

export function principalFromRequest(request: Request): AuthPrincipal | null {
  return verifyToken(extractBearer(request.headers.authorization) ?? tokenFromQuery(request.query.token), authConfig.jwtSecret);
}

export function principalFromSocket(socket: Socket): AuthPrincipal | null {
  const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  return verifyToken(token, authConfig.jwtSecret);
}

export function requireHttpAction(request: Request, response: Response, roomId: string | undefined, action: BoardAction): AuthPrincipal | null {
  const principal = principalFromRequest(request);

  if (canAccessBoard(principal, roomId, action)) {
    return principal;
  }

  response.status(principal ? 403 : 401).json({ error: principal ? "Forbidden" : "Authentication required" });
  return null;
}

export function canAccessBoard(principal: AuthPrincipal | null, roomId: string | undefined, action: BoardAction) {
  if (!authConfig.required && !principal) {
    return true;
  }

  if (!principal) {
    return false;
  }

  if (principal.role === "instructor") {
    return rolePermissions.instructor.includes(action);
  }

  if (principal.roomId && roomId && principal.roomId !== roomId) {
    return false;
  }

  if (principal.roomId) {
    return rolePermissions[principal.role].includes(action);
  }

  if (!roomId) {
    return action !== "instructor" ? false : rolePermissions[principal.role].includes(action);
  }

  const boardRole = authStore.boardRole(roomId, principal.sub);
  return boardRole ? rolePermissions[boardRole].includes(action) : false;
}

export function sanitizeParticipantForPrincipal(participant: Participant, principal: AuthPrincipal | null): Participant {
  if (!principal) {
    return participant;
  }

  return {
    ...participant,
    id: principal.sub,
    name: principal.name,
    role: principal.role
  };
}

export function inviteSecretAllows(request: Request) {
  if (!authConfig.required) {
    return true;
  }

  return Boolean(authConfig.inviteSecret && request.headers["x-invite-secret"] === authConfig.inviteSecret);
}

function extractBearer(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function tokenFromQuery(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function publicUser(user: UserAccount) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}
