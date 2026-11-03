# CLAUDE.md

Kulturalna Karczma: a Poznań map + list + calendar of LARP, impro, RPG and board-game events, with an admin panel and automatic event import. Product spec: `DESIGN.md`. Setup, scripts and the import pipeline: `README.md`.

Write lessons and conventions into this file or `.claude/rules/`, not only into private memory, so they are versioned and visible to everyone.

## Project rules

- **English code, Polish UI.** Identifiers, comments, API fields, error codes, URLs and DB values are English. Every user-facing string lives in `src/shared/i18n/pl.ts` (English localization may come later).
- **Bun + Postgres, minimal dependencies.** Prefer Bun built-ins (`Bun.serve`, `Bun.sql`, `Bun.file`, `bun test`) over packages. Pitfalls: `.claude/rules/bun-postgres.md`.
- **"Deploy" means the local dev server**: pull `main`, `bun run db:migrate`, restart `bun run dev` on localhost:3000, check it in a browser. The public server (`DEPLOY.md`) is updated with `deploy/update.sh` only when asked.
- **Every change goes through a PR** on a feature branch (`/branch-commit-pr`). Never push to `main`. Git details: `.claude/rules/git-workflow.md`.
- **`bun run verify` (typecheck, tests, build) passes before every push**; the pre-push hook runs it.

## Coding principles

### Think before coding
- State assumptions. If a request has several readings, name them instead of picking one silently.
- If a simpler approach exists, say so and push back when warranted.
- When executing an agreed list of changes, apply each item as agreed or ask first; call out every deviation in the same message.

### Simplicity first
- No features beyond the request, no abstractions for single-use code, no error handling for impossible cases.
- If 200 lines could be 50, rewrite it.

### Surgical changes
- Don't "improve" adjacent code, comments or formatting; match the existing style.
- Remove what your change made unused. Mention pre-existing dead code instead of deleting it.
- Every changed line should trace back to the request.

### Comment sparingly
- A comment says what the code cannot: a non-obvious constraint, a trap, an ordering that matters. Never restate the code.
- One line for a mechanism, a few for an exported symbol's docblock. Longer reasoning belongs in the commit message, the PR body or a `.claude/rules/` file.
- Never narrate history in comments ("an earlier version did X"). Write for a reader who never saw the conversation.

### Verify, don't trust
- Check bug reports and review findings against the actual code before acting; don't dismiss one without tracing the code path either.
- Don't guess root causes: prove them from logs, the database or a reproduction.
- Typecheck is not enough: never commit code whose tests have not passed. Testing pitfalls: `.claude/rules/testing.md`.

### Test the predicate before anything destructive
Before a DELETE, an UPDATE that hides or deactivates rows, or removing files or branches by a pattern (SQL `WHERE`, regex, glob):
1. Fetch at least one real row the predicate must keep and one it must drop.
2. Run the predicate against them and show which side each lands on.
3. If the user drew a boundary ("don't delete X"), show them the samples and wait.
4. Only then run it.

## Frontend

### Mobile-first, desktop too
- Design for phones first (320–393 px), then give ≥1024 px its own layout rather than a stretched phone column. Check both before shipping.
- No sideways scroll at 320 px; tap targets at least 44 px (links inside a sentence are exempt); `env(safe-area-inset-*)` on fixed or bottom-anchored bars.

### Design tokens in one place
- Colours, radii, spacing, shadows, fonts and z-indices are CSS custom properties on `:root` (with dark-mode overrides) in `src/site/styles.css` and `src/admin/admin.css`. Category colours are the `--c-*` (text, fills) and `--pin-*` (map) tokens with `.cat-<slug>` classes in `styles.css`; each category's icon and slug are in `src/shared/categories.ts`, the icon set in `src/shared/icons.ts`. The source design is `design/kulturalna-karczma-design/`.
- Check for an existing token before writing a literal; never add a near-duplicate (`9px` when `--radius` is 12px, a slightly different brown). If nothing fits, add one token and use it everywhere.

### Layout traps
- An `sr-only` element is `position: absolute`; without a positioned ancestor it can make the page scroll sideways. Give its container `position: relative`.
- A grid with no `grid-template-columns` is as wide as its widest child. Declare `grid-template-columns: minmax(0, 1fr)`.
- Imported event titles can be very long (`Dwudziesty pierwszy Wieczór Gier Planszowych w Osiedlowym Domu Kultury „Pod Lipami”`): use `overflow-wrap: anywhere` unless the text truncates.
- After changing frontend code, restart `bun run dev` if the browser still shows the old behaviour; `--hot` sometimes serves a stale bundle.

## Rule files and skills

- `.claude/rules/bun-postgres.md`: Bun SQL driver traps.
- `.claude/rules/testing.md`: proving tests, time-dependent fixtures, failures that aren't your diff, exit codes.
- `.claude/rules/git-workflow.md`: branches, pushing, PR scope and PR body.
- Skills: `/branch-commit-pr`, `/review <PR>`, `/bugfix`, `/environments` (local and prod: URLs, SSH, DB, deploying, APIs).
