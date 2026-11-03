---
name: bugfix
description: End-to-end bugfix workflow for this repo: understand the bug, reproduce it, find the root cause, plan, fix with a regression test, open a PR and verify on localhost.
user-invocable: true
---

# Fix a bug

## 1. Understand
State the bug in one line plus how it shows up:
```
Bug: <description>
Repro: <steps, URL, source or data that triggers it>
```
If it's unclear, ask one focused question.

## 2. Reproduce and find the root cause
- Reproduce on current `main`: a failing test, the page on localhost:3000, an import run (`bun run jobs:imports <source-key>`), or a query against the dev DB.
- If it does not reproduce, say what you tried and stop.
- Trace the exact code path and prove the cause from evidence (logs, DB rows, the source's raw data). Don't guess; if two explanations fit, check which one the evidence supports.

## 3. Plan
For anything beyond a one-line fix, show a short plan and get approval before editing:
- Root cause (1–2 sentences)
- Fix (what changes, which files)
- Why this fix is correct
- What will NOT change (scope)

## 4. Fix
1. New branch off `main` (see `/branch-commit-pr`).
2. Write a regression test first and watch it fail; then fix and watch it pass (`.claude/rules/testing.md` → "Prove a regression test").
3. If the bug corrupted data in the dev DB (wrong category, duplicate events, bad venue), clean it up only after testing the predicate on real rows (`CLAUDE.md` → "Test the predicate before anything destructive").
4. `bun run verify`.

## 5. PR and verify
1. Open the PR with `/branch-commit-pr`. The body names the root cause and how the fix was proven.
2. Optionally run `/review loop <PR>` for a fresh review.
3. Verify on localhost: restart `bun run dev`, then repeat the original repro (page, import run or query) and confirm it's fixed. For UI, check phone and desktop widths.
4. Report: root cause, fix, PR link, how it was verified. Merge only when the user says so.

## Rules
- Fix the reported bug only; list other problems you notice instead of fixing them in the same PR.
- After 3 failed attempts at a fix, stop and report what each attempt showed.
