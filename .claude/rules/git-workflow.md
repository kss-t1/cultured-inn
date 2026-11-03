# Git workflow

## Branches
- `main` is the base; never commit or push to it directly. One feature branch and one PR per piece of work (`/branch-commit-pr`).
- Before editing, check the branch: `git branch --show-current`. Don't leave uncommitted work behind when switching; commit it to its branch or open its PR.
- Never rebase or force-push a branch that has a PR. To pick up `main`, `git merge origin/main`.
- Never push to a merged PR's branch: check `gh pr view <n> --json state` first. Follow-ups go on a new branch off `main`.

## Worktrees
- Several sessions share the main checkout, so work for a PR goes in its own worktree: `git worktree add ../cultured-inn-<topic> -b <branch> origin/main`, then `ln -s ../cultured-inn/.env .env` and `bun install` inside it.
- **Once the PR is merged, remove its worktree and branch in the same session:**
  1. `gh pr view <n> --json state` says `MERGED`, and `git log origin/<branch>..<branch>` is empty (nothing unpushed).
  2. Stop any dev server started from the worktree.
  3. From the main checkout: `git worktree remove ../cultured-inn-<topic>`, then `git branch -d <branch>`.
- No `--force` or `-D`: if either refuses, there is uncommitted or unmerged work, so find out what it is first. Only remove worktrees you created; the others belong to other sessions.

## Pushing
- Push explicitly: `git push -u origin <branch>`, never a bare `git push`.
- `bun run verify` must pass first (the pre-push hook enforces it; `--no-verify` only with a stated reason).
- Before opening the PR, check its scope against the merge base: `git diff --stat origin/main...HEAD` lists only the intended files. Stage paths explicitly when the tree has unrelated changes.
- Commit and PR messages go through a heredoc (`git commit -F - <<'EOF'`, `gh pr create --body "$(cat <<'EOF' … EOF)"`). Backticks inside a double-quoted `-m "…"` are executed by the shell and the text silently disappears.

## PR body
- Open with two sentences before any heading: why the change is needed, then what it does.
- Write for a person who will use the result: what changes for them, what to check. Implementation detail goes in sections below.
- Include how it was verified (tests, browser check, real import run) and anything left open.
- Don't close GitHub issues unless asked; no `Fixes #N` keywords by default.
