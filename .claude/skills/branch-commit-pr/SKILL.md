---
name: branch-commit-pr
description: Create a branch, commit, push and open a PR. Use whenever work that changed files is ready, or when the user says "create PR", "open PR", "push and PR" or "commit this".
---

# Branch, commit, push and open a PR

1. **Branch.** If on `main`, create a branch first: `git checkout -b <short-kebab-description>`. If already on a feature branch whose PR is merged, start a new branch off `main` instead (`git fetch origin && git checkout -b <name> origin/main`, carrying the uncommitted changes with you).

2. **Verify.** `bun run verify` (typecheck, tests, build). If it fails, fix it before going on. If a failure is clearly unrelated (see `.claude/rules/testing.md`), say so explicitly.

3. **Stage only what belongs to this change.** Check `git status --short`; with unrelated changes in the tree, `git add <paths>` rather than `git add -A`. Never stage `.env`.

4. **Commit** with a heredoc, matching the style of `git log --oneline -5`: a short summary line, then the why and what.
   ```bash
   git commit -F - <<'EOF'
   <summary line>

   <why, then what changed>

   <attribution line from the session instructions, if any>
   EOF
   ```

5. **Check scope**: `git diff --stat origin/main...HEAD` lists only the intended files.

6. **Push**: `git push -u origin <branch>` (the pre-push hook runs `bun run verify` again).

7. **Open the PR** against `main` with a body that follows `.claude/rules/git-workflow.md` → "PR body":
   ```bash
   gh pr create --base main --title "<title>" --body "$(cat <<'EOF'
   <Why, one sentence.> <What, one sentence.>

   ## Changes
   - …

   ## Verified
   - …

   <PR attribution line from the session instructions, if any>
   EOF
   )"
   ```

8. **Report** the PR link and one line on what's in it. Don't merge unless the user asked.
