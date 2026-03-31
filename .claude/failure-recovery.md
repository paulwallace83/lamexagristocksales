# Failure Recovery Playbook

What to do when things go wrong during batch execution. Read this when a batch leaves the codebase in a broken state.

---

## 1. Tests Failing After Implementation

**Symptoms:** `npm test` reports failures. `npx tsc --noEmit` may or may not pass.

**Recovery steps:**
1. Read the test failure output carefully — identify whether the failure is in new tests or existing tests.
2. If **new tests** fail: the implementation doesn't match the acceptance criteria. Fix the implementation, not the test (unless the test itself has a bug in its fixture/assertion).
3. If **existing tests** fail: the change broke something that was working before. This is a regression.
   - Run `git diff` against the batch's starting point to see what changed.
   - Check if a shared function in `lib/` was modified in a way that affects other callers.
   - Fix the regression before continuing.
4. Do NOT skip or delete failing tests to make the suite pass.
5. Do NOT mark the batch as complete if tests are failing.

---

## 2. TypeScript Type Errors

**Symptoms:** `npx tsc --noEmit` reports errors.

**Recovery steps:**
1. Read the error messages — they usually point to the exact file and line.
2. Common causes in this project:
   - **Missing type on a new function parameter** — add the type annotation.
   - **Changed a shared type in `lib/inventory.ts`** — all consumers need updating.
   - **Imported a server-only module in a client component** — `better-sqlite3` cannot be imported client-side. Move the import to a route handler or server component.
   - **New DB column not reflected in the TypeScript type** — update the type in the relevant `lib/*.ts` file.
3. Fix all type errors before running tests — type errors can cause misleading test failures.

---

## 3. Build Failure (`npm run build`)

**Symptoms:** `next build` fails.

**Recovery steps:**
1. Read the build error output.
2. Common causes:
   - **`better-sqlite3` bundled into client chunk** — check that it's in `serverExternalPackages` in `next.config.ts` and that no client component imports a lib module that imports `getDb()`.
   - **Missing environment variable at build time** — `RAILWAY_VOLUME_PATH` is not available during build. Any code that reads from the volume must be runtime-only (server component render, route handler, CLI script).
   - **Dynamic import issue** — `next build` statically analyses imports. If a new dynamic import path is computed from a variable, it may fail.
3. Do NOT add `// @ts-ignore` or `// @ts-nocheck` to fix build errors.

---

## 4. Database Schema Mismatch

**Symptoms:** Runtime error like `table X has no column named Y` or `no such table: X`.

**Recovery steps:**
1. The migration system is ad-hoc — `lib/db.ts migrate()` uses `PRAGMA table_info` checks.
2. If you added a new column:
   - Add an `if (!hasColumn(...))` block in the `migrate()` function.
   - Run `npm run dev` to trigger the migration.
3. If you added a new table:
   - Add the `CREATE TABLE IF NOT EXISTS` statement in the `initializeDatabase()` function in `lib/db.ts`.
   - Ensure it's in the "preserved during sync" list if it should survive weekly syncs.
4. If the database is in a bad state locally:
   - Delete `lamex.db` and run `npm run seed` for a fresh start (destructive — loses all local documents, users, conversations, COA data).
   - In production: never delete `lamex.db`. Fix the migration and redeploy.

---

## 5. Sync Broke After the Change

**Symptoms:** `npm run sync` fails, produces wrong data, or loses documents/COA data.

**This is the highest-severity failure mode in this project.**

**Recovery steps:**
1. **Do NOT run sync again** until you understand what went wrong.
2. Check `data/snapshots/` for the most recent pre-sync snapshot. This is your rollback point.
3. Common causes:
   - **New data stored by lot ID instead of lot number** — lot IDs change every sync. Check `LESSONS.md` entry on this.
   - **New table not excluded from the re-seed wipe** — check `autoSeed()` in `lib/db.ts` to see which tables are preserved.
   - **`relinkDocumentLots()` or `relinkCoaData()` failed silently** — check that lot numbers in the new data match lot numbers in the re-seeded inventory.
   - **`deductDiscountLots()` failed** — discount lots may reappear in regular inventory.
4. To recover:
   - Restore `data/inventory.json` from the snapshot: `cp data/snapshots/inventory-YYYY-MM-DD.json data/inventory.json`
   - Run `npm run sync` to re-seed from the snapshot.
   - Verify with the reconciliation report.

---

## 6. Partial Implementation (Batch Abandoned Mid-Way)

**Symptoms:** You ran out of context, hit an unexpected blocker, or need to hand off to a new session.

**Recovery steps:**
1. Run `/handoff` to generate a structured handoff document.
2. Check the current state:
   - `git status` — are there uncommitted changes?
   - `npm test` — do tests pass?
   - `npx tsc --noEmit` — does it type-check?
3. If the code is in a working state (tests pass, types clean) but incomplete:
   - Commit what you have with a `wip:` prefix: `wip: B001 — unit type validation done, duplicate detection remaining`
   - Update the batch document status to `in-progress` with a note on what's done and what's left.
4. If the code is in a broken state (tests fail, types broken):
   - Do NOT commit broken code.
   - Stash the changes: `git stash push -m "B001 partial — needs fixing"`
   - Note the stash in the handoff document.
5. The next agent session should read the handoff document and the batch document to understand where to pick up.

---

## 7. Review Findings Require Rework

**Symptoms:** A `/review-correctness`, `/review-security`, or `/review-integration` review found Critical issues.

**Recovery steps:**
1. Read the review document in `docs/reviews/`.
2. Critical findings must be fixed before merge — no exceptions.
3. Fix each Critical finding and note what you changed.
4. Re-run `npm test` and `npx tsc --noEmit` after fixes.
5. Do NOT re-run the same review skill yourself — a fresh session should verify the fixes.
6. Important findings can be deferred to the next batch — create a note in the batch document.

---

## 8. File Upload / Path Issue in Production

**Symptoms:** Files upload locally but return 404 in production, or vice versa.

**Recovery steps:**
1. Check that all file paths go through `lib/paths.ts getUploadsRoot()` — never hardcode `public/uploads/`.
2. On Railway, the volume is at `RAILWAY_VOLUME_PATH`. Locally it's `public/uploads/`.
3. Verify the path traversal guard is in place:
   ```ts
   const resolved = path.resolve(targetDir, filename);
   if (!resolved.startsWith(uploadsRoot + "/")) throw new Error("Path traversal");
   ```
4. If files were written to the wrong path, they may need to be moved on the Railway volume via the admin tools API endpoints (not CLI scripts — those run locally).

---

## Decision Tree

```
Something broke
  ├── Tests failing?
  │     ├── New tests → Fix implementation
  │     └── Existing tests → You caused a regression — fix it
  ├── Types broken?
  │     └── Fix types before anything else
  ├── Build failing?
  │     └── Check client/server boundary and env vars
  ├── Sync broke?
  │     └── DO NOT re-run sync. Restore from snapshot. Check lot ID vs lot number.
  ├── Out of context / need to stop?
  │     └── Run /handoff. Commit if clean, stash if broken.
  └── Review found Critical issues?
        └── Fix all Critical findings. Re-test. Fresh session re-reviews.
```
