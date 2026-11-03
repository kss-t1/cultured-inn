---
name: review
description: Review a GitHub PR (number or URL) for correctness, completeness and quality, grade it A–F and post the review as a PR comment. "review loop <PR>" repeats review → fix until every grade is at least A-.
user-invocable: true
---

# Review a pull request

## One-shot review (`review <PR>`)

1. **Fetch the PR**:
   ```bash
   gh pr view <N> --json title,body,state,baseRefName,headRefName,files
   gh pr diff <N>
   ```
   Use `gh pr diff` (always scoped to the PR) rather than a local `git diff main...`, which includes other merged work when the local `main` is stale.

2. **Read the changed files in full and their callers**, not just the diff. Read `CLAUDE.md` and the `.claude/rules/` files that apply.

3. **Grade three axes, A+ to F:**
   - **Correctness**: logic, edge cases (time zones and DST, empty or missing data, duplicate imports), races, SQL behaviour (`.claude/rules/bun-postgres.md`), security of admin routes.
   - **Completeness**: does it do everything the PR claims; tests for new behaviour; error paths; docs (`README.md`, `DESIGN.md`) and i18n strings updated.
   - **Quality**: readable, consistent with the code around it, no needless abstraction, comments only where they add something, no Polish in code (UI strings only in `src/shared/i18n/pl.ts`), mobile-first for UI.

4. **Validate every finding before including it.** Read the surrounding code: is it a bug or a deliberate choice? Don't pattern-match ("missing X = bug"). Don't inflate severity. More findings in a big PR is not a worse grade by itself.

5. **Post it as a comment** (never edit the PR body):
   ```bash
   gh pr comment <N> --body "$(cat <<'EOF'
   ## Review: <title>

   | Correctness | Completeness | Quality | Overall |
   |---|---|---|---|
   | <grade> | <grade> | <grade> | <grade> |

   ### Findings
   - **<Critical|High|Medium|Low|Nit>** `path/file.ts:123`: <problem, and the concrete fix>

   ### What's good
   - …

   **Recommendation:** ship / iterate / block, with one line why.
   EOF
   )"
   ```

## Review loop (`review loop <PR>`)

1. Get the PR number (`gh pr view --json number --jq .number` on the current branch if not given).
2. Start a **fresh** `general-purpose` agent with no context from this conversation, so it isn't anchored on the author's view. Prompt: review PR #<N> of this repo exactly as in "One-shot review" above (read `CLAUDE.md`, use `gh pr diff <N>`, validate findings, post one comment with the grade table and findings with file:line and severity).
3. Read the posted comment (`gh pr view <N> --comments`) and take the three grades.
4. All A+/A/A- → stop. Otherwise fix the findings that hold up (note any that are wrong, with the reason), run `bun run verify`, commit, `git push origin <branch>`, and go back to step 2.
5. Stop after **5 rounds** and report what is blocking.
6. Report the number of rounds, the final grades and what was fixed.

If the reviewer agent cannot run, say so; never present a review that did not happen as a clean one.
