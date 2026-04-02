# Integration Review — B003

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** docs/batches/B003-requirements.md

## Critical (must fix before merge)

- **[app/api/documents/[productId]/route.ts]** — The DELETE handler's `safePath()` function (line 13) uses a **blocklist** regex (`/[/\\?%*<>"\x00-\x1f]/g`) that preserves spaces, pipes, brackets, and other characters. The upload route's `safePath()` (app/api/upload/route.ts:23) and `lib/documents.ts`'s `safeSeg()` (line 369) both use a stricter **allowlist** regex (`/[^a-zA-Z0-9._-]/g`) that strips everything except alphanumeric, dots, underscores, and hyphens. When the upload stores a file, the path goes through `getUploadDir()` which calls the strict `safeSeg()`. When delete constructs the path manually, it uses the permissive `safePath()`. If any lot number, contract, or product ID contains a space, pipe, or bracket, the DELETE will look for the file at a different path than where it was stored, silently failing to remove the physical file (the DB row is removed regardless). **Fix:** Replace the manual path construction in the DELETE handler with a call to `getUploadDir()` from `lib/documents.ts` — the same function used by the upload route — to guarantee path consistency. The `lotId` parameter (which actually receives a lot number) should be passed as `lotNumber` to `getUploadDir()`.

## Important (should fix, can be next batch)

- **[app/api/documents/[productId]/route.ts:54,68-69]** — The DELETE handler's query parameter is named `lotId` but the client sends `doc.lotNumbers[0]` — a lot **number** string, not a lot ID integer. The directory structure uses lot numbers (`uploads/{productId}/lots/{lotNumber}/...`), and the value works correctly as a path segment, but the parameter name violates the codebase convention that "lot ID" means an unstable auto-increment integer while "lot number" means a stable supplier string (see `LESSONS.md` and `Architecture.md`'s "Key invariant"). This naming confusion will mislead future developers. Should be renamed to `lotNumber` in both the client (`QADashboardClient.tsx:326`) and the route handler. The requirements doc (B003-requirements.md:12) also uses `lotId` — the requirements should be corrected too.

- **[app/qa/(protected)/QADashboardClient.tsx:296-305]** — The `baseContracts` derivation manually extracts base contracts with `c.indexOf("-"); c.substring(0, dash)`. The function `extractBaseContract()` in `lib/inventory.ts:59` does exactly this. However, since this is a client component, it cannot import from `lib/inventory.ts` (which transitively imports `better-sqlite3`). The duplication is **necessary** here but should be documented with a comment referencing the canonical implementation, so they stay in sync if the extraction logic changes.

- **[app/api/documents/[productId]/route.ts, app/api/upload/route.ts, app/api/files/[...path]/route.ts, lib/documents.ts, scripts/backfill-coa.ts, lib/agent-tools.ts, app/api/backfill-coa/route.ts]** — Path sanitization (`safePath` / `safeSeg`) is defined independently in 7 files with two different regex patterns: a permissive blocklist (`/[/\\?%*<>"\x00-\x1f]/g`) in 3 files and a strict allowlist (`/[^a-zA-Z0-9._-]/g`) in 4 files. This creates a class of bugs where files written via one sanitizer can't be found by another. A single canonical `safeSeg()` should be exported from `lib/paths.ts` and imported everywhere. This is pre-existing debt but was extended by B003 adding a new `safePath` in the documents route.

- **[tests/]** — No tests were added for the new DELETE handler logic or the `removeDocument()` function. `removeDocument()` in `lib/documents.ts` (line 356) is a pure DB operation that could be unit-tested in `tests/documents.test.ts` following the existing mock pattern (`vi.mock("../lib/db")`). The inline upload form logic and `handleDelete` are client-side and harder to test, but the server-side delete path (file removal + DB removal) is testable and is the most important path to verify.

## Minor (nice to have)

- **[app/qa/(protected)/QADashboardClient.tsx:22-31]** — `CATEGORY_LABELS`, `CATEGORY_ORDER`, and `LOT_LEVEL_CATS` duplicate category knowledge from `lib/documents.ts` (`LOT_LEVEL_CATEGORIES`, `ALL_CONTRACT_CATEGORIES`, `getCategoryLabel()`). This is necessary because client components can't import server modules, but the duplication means adding a new category requires updating both files. A shared `lib/constants.ts` (no server deps) could provide a single source.

- **[app/api/documents/[productId]/route.ts:68-73]** — The DELETE handler constructs file paths manually (`join(uploadsRoot, safeProductId, "lots", ...)`) instead of using `getUploadDir()` from `lib/documents.ts`. This duplicates the directory structure knowledge. Even after fixing the sanitization mismatch, the manual construction is fragile — if the directory structure changes (e.g., nested differently), the delete handler won't follow. Using `getUploadDir()` with a flag to skip directory creation would be more robust.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — delete uses `doc.lotNumbers[0]` for file paths; upload resolves lot IDs to lot numbers server-side before storage
- [x] New tables/columns added to the "preserved during sync" path — N/A, no new tables or columns
- [x] Migration block in `lib/db.ts` for any schema changes — N/A, no schema changes
- [x] No assumptions about lot ID stability — the upload form sends lot IDs to the upload route which immediately resolves them to lot numbers; the delete path uses lot numbers from the document record. The `lotId` parameter *name* is misleading but the *value* is a lot number

## Future Batch Readiness

- **E3 (QA Workflow remaining items)**: Ready — the panel architecture (expandable rows, per-category sections, inline forms) provides a clean foundation for adding supplier/status filters (next E3 item)
- **E2 (COA review queue)**: Ready — no conflicts; COA data flows are untouched
- **E1 (Agent-powered sync)**: Ready — no conflicts
- **Overall foundation**: Solid, with one caveat — the `safePath`/`safeSeg` inconsistency is a landmine for any future route that constructs file paths. Fixing it now prevents a class of silent bugs.

## Doc Updates Needed

- [ ] CLAUDE.md: No changes needed (already updated with B003 in-progress status)
- [ ] Architecture.md: No changes needed (no new routes or architectural patterns introduced)
- [ ] LESSONS.md: Add lesson about path sanitization inconsistency — "safePath/safeSeg functions exist in 7 files with two different regex patterns; always use `getUploadDir()` / `getDocumentUrl()` from `lib/documents.ts` rather than constructing paths manually in route handlers"
