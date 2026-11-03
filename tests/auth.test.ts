import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db.ts";
import {
  checkOrigin, hashPassword, LOCKOUT_MAX_FAILURES, login, logout, sessionId, userForToken,
} from "../src/lib/auth.ts";
import { resetDb } from "./helpers.ts";

const PASSWORD = "correct horse battery staple";

beforeEach(async () => {
  await resetDb();
  await sql`INSERT INTO admin_users (email, password_hash) VALUES ('admin@example.com', ${await hashPassword(PASSWORD)})`;
});

describe("origin check", () => {
  const req = (method: string, origin?: string) =>
    new Request("http://127.0.0.1:3000/api/admin/events", { method, headers: origin ? { Origin: origin } : {} });

  test("safe methods pass without Origin", () => {
    expect(checkOrigin(req("GET"))).toBe(true);
  });
  test("mutating request needs an allowed Origin", () => {
    expect(checkOrigin(req("POST"))).toBe(false);
    expect(checkOrigin(req("POST", "https://evil.example"))).toBe(false);
    expect(checkOrigin(req("DELETE", "https://karczma.test"))).toBe(true); // PUBLIC_BASE_URL
  });
  test("request's own origin is allowed outside production only", () => {
    expect(checkOrigin(req("PUT", "http://127.0.0.1:3000"))).toBe(true);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(checkOrigin(req("PUT", "http://127.0.0.1:3000"))).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("login", () => {
  test("valid credentials create a session usable via its token", async () => {
    const r = await login("Admin@Example.com ", PASSWORD, "1.1.1.1", "ua");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await userForToken(r.token)).toEqual({ id: r.user.id, email: "admin@example.com" });
    // Only the HMAC of the token is stored.
    const [s] = await sql`SELECT id FROM admin_sessions`;
    expect(s.id).toBe(sessionId(r.token));
    expect(s.id).not.toBe(r.token);
    await logout(r.token);
    expect(await userForToken(r.token)).toBeNull();
  });

  test("wrong password and unknown email are both 'invalid'", async () => {
    expect(await login("admin@example.com", "nope", "1.1.1.1", null)).toEqual({ ok: false, reason: "invalid" });
    expect(await login("ghost@example.com", "nope", "1.1.1.1", null)).toEqual({ ok: false, reason: "invalid" });
  });

  test(`locks out after ${LOCKOUT_MAX_FAILURES} failures from one IP, even with the right password`, async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      await login(`guess${i}@example.com`, "wrong", "6.6.6.6", null);
    }
    expect(await login("admin@example.com", PASSWORD, "6.6.6.6", null)).toEqual({ ok: false, reason: "locked" });
    expect((await login("admin@example.com", PASSWORD, "7.7.7.7", null)).ok).toBe(true);
  });

  test("locks out an account after failures spread across IPs", async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      await login("admin@example.com", "wrong", `10.0.0.${i}`, null);
    }
    expect(await login("admin@example.com", PASSWORD, "10.0.0.99", null)).toEqual({ ok: false, reason: "locked" });
  });

  test("failures older than the window don't count", async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      await login("admin@example.com", "wrong", "6.6.6.6", null);
    }
    await sql`UPDATE login_attempts SET at = now() - interval '16 minutes'`;
    expect((await login("admin@example.com", PASSWORD, "6.6.6.6", null)).ok).toBe(true);
  });

  test("expired sessions are rejected", async () => {
    const r = await login("admin@example.com", PASSWORD, "1.1.1.1", null);
    if (!r.ok) throw new Error("login failed");
    await sql`UPDATE admin_sessions SET expires_at = now() - interval '1 second'`;
    expect(await userForToken(r.token)).toBeNull();
  });
});
