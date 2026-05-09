import assert from "node:assert/strict";
import test from "node:test";
import { signToken, verifyToken } from "./tokens";

test("signs and verifies access tokens", () => {
  const token = signToken(
    {
      sub: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "owner",
      type: "user"
    },
    "secret",
    60
  );
  const principal = verifyToken(token, "secret");

  assert.equal(principal?.sub, "user-1");
  assert.equal(principal?.email, "ada@example.com");
  assert.equal(principal?.role, "owner");
});

test("rejects tampered tokens", () => {
  const token = signToken(
    {
      sub: "user-1",
      name: "Ada Lovelace",
      role: "owner",
      type: "user"
    },
    "secret",
    60
  );
  const [header, payload, signature] = token.split(".");
  const tampered = `${header}.${Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url")}.${signature}`;

  assert.equal(verifyToken(tampered, "secret"), null);
  assert.equal(verifyToken(token, "wrong-secret"), null);
});

test("rejects expired tokens", () => {
  const token = signToken(
    {
      sub: "user-1",
      name: "Ada Lovelace",
      role: "owner",
      type: "user",
      exp: Math.floor(Date.now() / 1000) - 1
    },
    "secret",
    60
  );

  assert.equal(verifyToken(token, "secret"), null);
});
