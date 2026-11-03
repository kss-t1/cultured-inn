// JSON client for /api/admin/*. Errors carry the API error code and per-field codes.
import { t } from "../shared/i18n/index.ts";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public fields: Record<string, string> = {}) {
    super(code);
  }
  /** Translated top-level message. */
  get text(): string {
    return t.errors[this.code] ?? t.errors.generic!;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") onUnauthorized();
    throw new ApiError(res.status, data.error ?? "generic", data.fields ?? {});
  }
  return data as T;
}

/** Translated message for a field error code. */
export const fieldMessage = (code: string | undefined) =>
  code ? (t.fieldErrors[code] ?? t.fieldErrors.invalid) : undefined;
