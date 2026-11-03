// Admin auth: argon2id passwords (Bun.password), DB-backed sessions, login lockout, Origin check.
import type { BunRequest, Server } from "bun";
import { sql } from "../db.ts";

export const SESSION_COOKIE = "karczma_session";
export const SESSION_TTL_DAYS = 14;
export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW = "15 minutes";

export interface AdminUser {
  id: number;
  email: string;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || (process.env.NODE_ENV === "production" && (s === "change-me" || s.length < 32))) {
    throw new Error("SESSION_SECRET must be set (32+ random chars in production)");
  }
  return s;
}

/** Sessions are stored by HMAC(token) so a DB dump can't be replayed as cookies. */
export function sessionId(token: string): string {
  return new Bun.CryptoHasher("sha256", secret()).update(token).digest("hex");
}

function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

// Verified against when the email is unknown, so timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;

export function clientIp(req: Request, server: Server<unknown>): string {
  if (process.env.TRUST_PROXY === "1") {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",").at(-1)!.trim(); // rightmost = added by our proxy
  }
  return server.requestIP(req)?.address ?? "unknown";
}

/** Origins allowed to make mutating admin requests (CSRF defence, on top of SameSite=Strict). */
export function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  const base = process.env.PUBLIC_BASE_URL;
  if (base) set.add(new URL(base).origin);
  if (process.env.NODE_ENV !== "production") set.add(new URL(req.url).origin);
  return set;
}

export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** True when the request may proceed: safe method, or an Origin header from an allowed origin. */
export function checkOrigin(req: Request): boolean {
  if (isSafeMethod(req.method)) return true;
  const origin = req.headers.get("origin");
  return origin !== null && allowedOrigins(req).has(origin);
}

export type LoginResult =
  | { ok: true; user: AdminUser; token: string }
  | { ok: false; reason: "locked" | "invalid" };

export async function isLockedOut(ip: string, email: string): Promise<boolean> {
  const [row] = await sql`
    SELECT count(*) FILTER (WHERE ip = ${ip})::int AS by_ip,
           count(*) FILTER (WHERE email = ${email})::int AS by_email
    FROM login_attempts
    WHERE NOT success AND at > now() - ${LOCKOUT_WINDOW}::interval`;
  return row.by_ip >= LOCKOUT_MAX_FAILURES || row.by_email >= LOCKOUT_MAX_FAILURES;
}

export async function login(
  email: string,
  password: string,
  ip: string,
  userAgent: string | null,
): Promise<LoginResult> {
  email = email.trim().toLowerCase();
  if (await isLockedOut(ip, email)) return { ok: false, reason: "locked" };

  const [user] = await sql`SELECT id, email, password_hash FROM admin_users WHERE email = ${email}`;
  dummyHash ??= hashPassword("dummy-password-for-timing");
  const valid = await Bun.password.verify(password, user?.password_hash ?? (await dummyHash));
  const success = Boolean(user) && valid;

  await sql`INSERT INTO login_attempts (ip, email, success) VALUES (${ip}, ${email}, ${success})`;
  if (!success) return { ok: false, reason: "invalid" };

  const token = randomToken();
  await sql`
    INSERT INTO admin_sessions (id, user_id, expires_at, ip, user_agent)
    VALUES (${sessionId(token)}, ${user.id}, now() + ${`${SESSION_TTL_DAYS} days`}::interval,
            ${ip}, ${userAgent?.slice(0, 300) ?? null})`;
  // Housekeeping, cheap enough to do on each successful login.
  await sql`DELETE FROM admin_sessions WHERE expires_at < now()`;
  await sql`DELETE FROM login_attempts WHERE at < now() - interval '30 days'`;
  return { ok: true, user: { id: user.id, email: user.email }, token };
}

export async function userForToken(token: string | null | undefined): Promise<AdminUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await sql`
    SELECT u.id, u.email FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
    WHERE s.id = ${sessionId(token)} AND s.expires_at > now()`;
  return (row as AdminUser) ?? null;
}

export async function logout(token: string | null | undefined): Promise<void> {
  if (token) await sql`DELETE FROM admin_sessions WHERE id = ${sessionId(token)}`;
}

export function setSessionCookie(req: BunRequest, token: string) {
  req.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: (process.env.PUBLIC_BASE_URL ?? "").startsWith("https:") || process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
  });
}

export function clearSessionCookie(req: BunRequest) {
  req.cookies.delete({ name: SESSION_COOKIE, path: "/" });
}
