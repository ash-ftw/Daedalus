import Redis from "ioredis";
import type { Participant } from "../../../shared/src/types";
import type { BackendStatus } from "./types";

export interface PresenceStore {
  status: BackendStatus;
  initialize(): Promise<void>;
  upsertParticipant(roomId: string, participant: Participant): Promise<void>;
  updateParticipant(roomId: string, participantId: string, patch: Partial<Participant>): Promise<void>;
  removeParticipant(roomId: string, participantId: string): Promise<void>;
  listParticipants(roomId: string): Promise<Participant[]>;
}

class LocalPresenceStore implements PresenceStore {
  status: BackendStatus = {
    name: "local",
    configured: true,
    durable: false
  };

  async initialize() {
    return;
  }

  async upsertParticipant() {
    return;
  }

  async updateParticipant() {
    return;
  }

  async removeParticipant() {
    return;
  }

  async listParticipants() {
    return [];
  }
}

class RedisPresenceStore implements PresenceStore {
  status: BackendStatus = {
    name: "redis",
    configured: true,
    durable: false
  };

  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(url: string, ttlSeconds: number) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
    this.ttlSeconds = ttlSeconds;
  }

  async initialize() {
    await this.redis.connect();
  }

  async upsertParticipant(roomId: string, participant: Participant) {
    const key = presenceKey(roomId);
    await this.redis.hset(key, participant.id, JSON.stringify(participant));
    await this.redis.expire(key, this.ttlSeconds);
  }

  async updateParticipant(roomId: string, participantId: string, patch: Partial<Participant>) {
    const key = presenceKey(roomId);
    const existing = await this.redis.hget(key, participantId);
    if (!existing) {
      return;
    }

    await this.redis.hset(key, participantId, JSON.stringify({ ...(JSON.parse(existing) as Participant), ...patch }));
    await this.redis.expire(key, this.ttlSeconds);
  }

  async removeParticipant(roomId: string, participantId: string) {
    await this.redis.hdel(presenceKey(roomId), participantId);
  }

  async listParticipants(roomId: string) {
    const values = await this.redis.hvals(presenceKey(roomId));
    return values.flatMap((value) => {
      try {
        return [JSON.parse(value) as Participant];
      } catch {
        return [];
      }
    });
  }
}

function presenceKey(roomId: string) {
  return `whiteboard:presence:${roomId}`;
}

export function createPresenceStoreFromEnv(env = process.env): PresenceStore {
  if (!env.REDIS_URL) {
    return new LocalPresenceStore();
  }

  return new RedisPresenceStore(env.REDIS_URL, Number(env.REDIS_PRESENCE_TTL_SECONDS ?? 120));
}
