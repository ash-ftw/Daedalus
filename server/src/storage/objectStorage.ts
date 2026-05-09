import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BackendStatus } from "./types";

export interface ObjectStorage {
  status: BackendStatus;
  putJson(key: string, value: unknown): Promise<void>;
  putText(key: string, value: string, contentType: string): Promise<void>;
}

class NoopObjectStorage implements ObjectStorage {
  status: BackendStatus = {
    name: "none",
    configured: false,
    durable: false
  };

  async putJson() {
    return;
  }

  async putText() {
    return;
  }
}

class S3ObjectStorage implements ObjectStorage {
  status: BackendStatus = {
    name: "s3",
    configured: true,
    durable: true
  };

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(env: NodeJS.ProcessEnv) {
    const endpoint = env.S3_ENDPOINT || undefined;
    const accessKeyId = env.S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;

    this.bucket = env.S3_BUCKET ?? "";
    this.prefix = normalizePrefix(env.S3_PREFIX ?? "whiteboard");
    this.client = new S3Client({
      region: env.S3_REGION ?? env.AWS_REGION ?? "us-east-1",
      endpoint,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey
            }
          : undefined
    });
  }

  async putJson(key: string, value: unknown) {
    await this.putText(key, JSON.stringify(value, null, 2), "application/json");
  }

  async putText(key: string, value: string, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}${key}`,
        Body: value,
        ContentType: contentType
      })
    );
  }
}

function normalizePrefix(prefix: string) {
  const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
}

export function createObjectStorageFromEnv(env = process.env): ObjectStorage {
  if (!env.S3_BUCKET) {
    return new NoopObjectStorage();
  }

  return new S3ObjectStorage(env);
}
