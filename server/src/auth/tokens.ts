import crypto from "node:crypto";
import type { ParticipantRole } from "../../../shared/src/types";

export interface AuthPrincipal {
  sub: string;
  name: string;
  email?: string;
  role: ParticipantRole;
  roomId?: string;
  type: "guest" | "user";
  exp: number;
  iat: number;
}

type TokenPayload = Omit<AuthPrincipal, "iat" | "exp"> & {
  iat?: number;
  exp?: number;
};

export function signToken(payload: TokenPayload, secret: string, ttlSeconds: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const fullPayload: AuthPrincipal = {
    ...payload,
    iat: payload.iat ?? nowSeconds,
    exp: payload.exp ?? nowSeconds + ttlSeconds
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(fullPayload))}`;
  const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");

  return `${unsigned}.${signature}`;
}

export function verifyToken(token: string | undefined, secret: string): AuthPrincipal | null {
  if (!token) {
    return null;
  }

  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const principal = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthPrincipal;
    if (principal.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return principal;
  } catch {
    return null;
  }
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
