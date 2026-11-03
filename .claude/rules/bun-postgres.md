# Bun SQL and Postgres traps

- **A Postgres error's SQLSTATE is on `.errno` under `Bun.sql`, not `.code`** (Bun puts its own `ERR_POSTGRES_SERVER_ERROR` there). Match both: `(e as { errno?: string })?.errno ?? (e as { code?: string })?.code`, as `src/lib/http.ts` does for `23505`.
- **Don't interpolate a JS `Date` into `sql.unsafe()` or a connection with `prepare: false`**: it reaches Postgres as `Date.toString()` ("Wed May 27 2026 …") and fails. Pass `date.toISOString()`.
- **`date`/`timestamp` columns come back as JS `Date` objects.** `String(row.day)` starts with the weekday name, so sorting those strings orders Fri, Mon, Sat…; sort by `getTime()` or format with `toISOString()` first. Local Warsaw dates are computed in SQL (`AT TIME ZONE`) or via `src/shared/format.ts`.
- **Bind JS arrays with `sql.array(values, "INT4" | "TEXT" …)`**; a bare array inside `= ANY(${arr})` fails with `22P02`.
- **jsonb: pass the object itself (`${obj}::jsonb`).** `${JSON.stringify(obj)}::jsonb` can store the whole JSON text as one jsonb string scalar, so readers get a string back instead of an object.
- **A backtick anywhere inside a `sql\`…\`` template closes it early**, including inside a SQL `--` comment; `tsc` then reports `TS1005` many lines later.
- **Advisory locks belong to a connection.** Take and release them on one `sql.reserve()` connection (`db/migrate.ts`, `runSource` in `src/importers/run.ts`); on the pool, the unlock may run on a different connection and the lock stays held.
- **Need Bun ≥ 1.4**: Bun 1.3.x's pool can route an ordinary query into a connection a `sql.begin` transaction holds, and one failure there aborts the transaction (`25P02`).
- **Backslash escapes inside a `sql\`…\`` template are processed by JavaScript first**: `'\s+'` reaches Postgres as `'s+'`, so `regexp_replace(x, '\s+', ' ')` deleted every letter "s" from event excerpts. Use backslash-free classes (`[[:space:]]`, `[[:digit:]]`), or pass the pattern as a parameter (`${"\\s+"}`).
