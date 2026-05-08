import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import type { Server } from "socket.io";
import type { Participant } from "../../shared/src/types";

type RealtimeProvider = "memory" | "redis";

interface RealtimeScaleStatus {
  provider: RealtimeProvider;
  enabled: boolean;
  presenceShared: boolean;
  lastError?: string;
}

const redisUrl = process.env.REDIS_URL?.trim();
const presencePrefix = process.env.REDIS_PRESENCE_PREFIX?.trim() || "daedalus:presence";
const presenceTtlSeconds = Math.max(15, Number(process.env.REDIS_PRESENCE_TTL_SECONDS) || 120);

let provider: RealtimeProvider = "memory";
let lastError: string | undefined;
let presenceClient: RedisClientType | undefined;

function presenceKey(roomId: string) {
  return `${presencePrefix}:${roomId}`;
}

function presenceField(connectionId: string) {
  return connectionId;
}

function parseParticipant(value: string): Participant | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<Participant>;

    if (!parsed.id || !parsed.name || !parsed.color || !parsed.role) {
      return undefined;
    }

    return {
      id: parsed.id,
      name: parsed.name,
      color: parsed.color,
      role: parsed.role,
      tool: parsed.tool ?? "select",
      online: true,
      joinedAt: parsed.joinedAt ?? new Date().toISOString(),
      lastActiveAt: parsed.lastActiveAt ?? new Date().toISOString()
    };
  } catch {
    return undefined;
  }
}

function collapseParticipants(participants: Participant[]) {
  const byParticipantId = new Map<string, Participant>();

  participants.forEach((participant) => {
    const existing = byParticipantId.get(participant.id);

    if (!existing || participant.lastActiveAt.localeCompare(existing.lastActiveAt) > 0) {
      byParticipantId.set(participant.id, participant);
    }
  });

  return Array.from(byParticipantId.values()).sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
}

export async function initializeRealtimeScale(io: Server) {
  if (!redisUrl) {
    return;
  }

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  const commandClient = pubClient.duplicate();

  try {
    await Promise.all([pubClient.connect(), subClient.connect(), commandClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    presenceClient = commandClient as RedisClientType;
    provider = "redis";
    lastError = undefined;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Redis real-time scale initialization failed";
    provider = "memory";
    await Promise.allSettled([pubClient.disconnect(), subClient.disconnect(), commandClient.disconnect()]);
  }
}

export function getRealtimeScaleStatus(): RealtimeScaleStatus {
  return {
    provider,
    enabled: provider === "redis",
    presenceShared: Boolean(presenceClient),
    lastError
  };
}

export async function setPresence(roomId: string, connectionId: string, participant: Participant) {
  if (!presenceClient) {
    return;
  }

  const timestamp = new Date().toISOString();
  const nextParticipant: Participant = {
    ...participant,
    online: true,
    lastActiveAt: timestamp
  };

  await presenceClient.hSet(presenceKey(roomId), presenceField(connectionId), JSON.stringify(nextParticipant));
  await presenceClient.expire(presenceKey(roomId), presenceTtlSeconds);
}

export async function updatePresence(roomId: string, connectionId: string, patch: Partial<Participant>) {
  if (!presenceClient) {
    return;
  }

  const key = presenceKey(roomId);
  const field = presenceField(connectionId);
  const existing = await presenceClient.hGet(key, field);
  const participant = existing ? parseParticipant(existing) : undefined;

  if (!participant) {
    return;
  }

  await presenceClient.hSet(
    key,
    field,
    JSON.stringify({
      ...participant,
      ...patch,
      online: true,
      lastActiveAt: new Date().toISOString()
    })
  );
  await presenceClient.expire(key, presenceTtlSeconds);
}

export async function removePresence(roomId: string, connectionId: string) {
  if (!presenceClient) {
    return;
  }

  await presenceClient.hDel(presenceKey(roomId), presenceField(connectionId));
}

export async function listPresence(roomId: string, fallback: Participant[]) {
  if (!presenceClient) {
    return fallback;
  }

  const values = await presenceClient.hVals(presenceKey(roomId));
  const participants = values.map(parseParticipant).filter(Boolean) as Participant[];
  return collapseParticipants(participants);
}
