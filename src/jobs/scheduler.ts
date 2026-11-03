// In-process scheduler (DESIGN.md §6): every few minutes, run the import sources that are due.
// Enabled in production, or anywhere with IMPORTS_SCHEDULER=1; off with IMPORTS_SCHEDULER=0.
// A global advisory lock keeps two server instances from sweeping at the same time, and each
// source run takes its own lock (run.ts), so the CLI and "Run now" can't collide with it either.
import { sql } from "../db.ts";
import { runDueSources } from "../importers/run.ts";

const SWEEP_LOCK = 727003;
const INTERVAL_MS = 10 * 60_000;
const FIRST_RUN_DELAY_MS = 30_000;

export function schedulerEnabled(): boolean {
  const flag = process.env.IMPORTS_SCHEDULER;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV === "production";
}

async function sweep() {
  const conn = await sql.reserve();
  try {
    const [{ locked }] = await conn`SELECT pg_try_advisory_lock(${SWEEP_LOCK}) AS locked`;
    if (!locked) return;
    try {
      await runDueSources();
    } finally {
      await conn`SELECT pg_advisory_unlock(${SWEEP_LOCK})`;
    }
  } catch (e) {
    console.error("[scheduler] sweep failed", e);
  } finally {
    conn.release();
  }
}

// `bun --hot` re-evaluates modules; keep a single timer per process.
const g = globalThis as { __importScheduler?: Timer };

export function startScheduler() {
  if (!schedulerEnabled() || g.__importScheduler) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweep();
    } finally {
      running = false;
    }
  };
  setTimeout(tick, FIRST_RUN_DELAY_MS);
  g.__importScheduler = setInterval(tick, INTERVAL_MS);
  console.log("[scheduler] import scheduler started");
}
