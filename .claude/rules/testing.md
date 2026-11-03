# Testing

## Prove a regression test
- A new test for a bug must fail without the fix. Undo the fix (stash it, or edit it out), run the test, see it go red, restore the fix.
- `git checkout -- <file>` restores the index version, so it does nothing to a change that is already committed. Undo a committed fix with `git stash`, a revert, or an edit.
- A test that stays green with the fix removed usually asserts the wrong thing (a state that was already true), rather than proving the code is dead.

## Time-dependent fixtures
- Tests pin "now" instead of reading the clock: `queryEvents(f, { now })`, `processCandidates(…, { now })`, and `event_window(kind, now_ts, …)` all take it as a parameter. Use fixed dates in fixtures (the suites use November 2026) and cover DST changes (last Sunday of March and October in Europe/Warsaw) when dates are involved.
- Fixtures written as `now() - interval '2 hours'` drift across midnight and month ends; prefer explicit timestamps.

## Failures that aren't your diff
- **Every test in a file fails, often `(unnamed)`**: the `beforeAll` failed (usually Postgres is down or the test DB is missing). Read the first error before theorising.
- **`57P03 the database system is shutting down`** or connection refused: Postgres restarted mid-run. Start it and rerun.
- **`53300 too many clients`** at the start of a run: the previous run's pools are still closing. Rerun.
- **`bun test` loads `.env`** before `.env.test`, so a key set only in `.env` leaks into tests. Tests must not depend on local `.env` values.

## Exit codes
- Only `&&` on an unpiped command is a gate. `bun test | tail` exits with `tail`'s status, so a red suite looks green. Check `PIPESTATUS`, or run without the pipe when the result decides what happens next.
- `bun run verify` (typecheck, tests, build) is the gate before every push; the pre-push hook in `.githooks/` runs it.
