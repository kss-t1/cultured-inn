// JSON helpers. Errors are returned as { error: "<code>", fields?: { <field>: "<code>" } };
// the UI translates codes via t.errors / t.fieldErrors.
import { z } from "zod";

export type ErrorCode =
  | "not_found" | "bad_json" | "validation_failed" | "unauthorized" | "forbidden_origin"
  | "invalid_credentials" | "locked_out" | "conflict" | "in_use" | "venue_has_events"
  | "geocode_failed" | "geocode_query_too_short" | "server_error";

export interface ApiError {
  error: ErrorCode;
  fields?: Record<string, string>;
}

export const json = (data: unknown, init: ResponseInit = {}) => Response.json(data, init);

export const error = (status: number, code: ErrorCode, extra: Omit<ApiError, "error"> = {}) =>
  Response.json({ error: code, ...extra } satisfies ApiError, { status });

export class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode) {
    super(code);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, "not_found");
  return id;
}

/** Validation codes we set explicitly in schemas.ts; anything else is reported generically. */
const FIELD_CODES = new Set([
  "required", "invalid_url", "invalid_email", "invalid_datetime", "end_before_start",
  "price_max_below_min", "coordinates_pair",
]);

export function fieldErrors(e: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    const code = FIELD_CODES.has(issue.message)
      ? issue.message
      : issue.code === "too_small" || (issue.code === "invalid_type" && issue.input === undefined)
        ? "required"
        : "invalid";
    fields[key] ??= code;
  }
  return fields;
}

/** Maps thrown errors to JSON responses. */
export function handleError(e: unknown): Response {
  if (e instanceof z.ZodError) return error(400, "validation_failed", { fields: fieldErrors(e) });
  if (e instanceof HttpError) return error(e.status, e.code);
  const code = (e as { errno?: string })?.errno ?? (e as { code?: string })?.code;
  if (code === "23505") return error(409, "conflict"); // unique_violation
  if (code === "23503") return error(409, "in_use"); // foreign_key_violation
  console.error(e);
  return error(500, "server_error");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
