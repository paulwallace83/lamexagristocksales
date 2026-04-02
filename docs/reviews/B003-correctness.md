# Correctness Review — B003

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** docs/batches/B003-requirements.md

## Pre-flight checks

- `npx tsc --noEmit` — **PASS** (zero errors)
- `npm test` — **PASS** (76 tests, 4 suites)

## Critical (must fix before merge)

- **[app/api/documents/[productId]/route.ts:13-14 — `safePath` function]** — The DELETE handler defines its own `safePath` using a **permissive** regex (`/[/\\?%*<>"\x00-\x1f]/g`) that preserves spaces, parentheses, and most special characters. The upload route (`app/api/upload/route.ts:23-25`) and `lib/documents.ts:safeSeg` both use a **restrictive** regex (`/[^a-zA-Z0-9._-]/g`). When a product ID, lot number, or contract number contains spaces or non-alphanumeric characters (e.g., `"IQF Blueberries (Wild)"`), the DELETE handler builds a different filesystem path than where the upload handler stored the file. Result: `existsSync()` returns false, file is **not** deleted from disk, but `removeDocument()` still removes the DB record — creating an orphaned file. **Triggered by:** deleting any document whose product ID, lot number, or base contract contains spaces, parentheses, or other characters outside `[a-zA-Z0-9._-]`. **Fix:** Replace the local `safePath` in the DELETE route with the same restrictive pattern used by the upload route, or better, import and use `getUploadDir()` from `lib/documents.ts` to construct the path identically to how upload stores it.

## Important (should fix, can be next batch)

- **[QADashboardClient.tsx:75-85 — `refreshDocs` silent failure + stale cache]** — When `refreshDocs` fails (network error, session expiry), the catch block silently discards the error and leaves stale data in `docsCache`. The comment says "user can re-expand to retry" but this is incorrect — `toggleExpand` (line 58) checks `if (docsCache[productId]) return` and skips the fetch when any cached data exists. After a successful delete/upload on the server but a failed refresh, the user sees stale data with no way to force a re-fetch except a full page reload. **Fix:** Either (a) delete the cache entry before calling `refreshDocs` so a failed refresh leaves `undefined` (triggering a fresh fetch on re-expand), or (b) always re-fetch on expand regardless of cache state, or (c) clear the cache key in the `catch` block: `setDocsCache(prev => { const next = {...prev}; delete next[productId]; return next; })`.

- **[QADashboardClient.tsx:289 — `deleting` state is a single string]** — `deleting` holds one document ID at a time. If the user confirms two rapid deletes (two `window.confirm` dialogs in quick succession), the `finally` block of the first-to-complete sets `deleting` to `null`, which re-enables the second document's delete button while its request is still in flight. This defeats DEL-5's double-click protection for concurrent operations. **Fix:** Change `deleting` from `string | null` to `Set<string>` and add/remove individual IDs.

## Minor (nice to have)

- **[QADashboardClient.tsx:325 — `lotId` param receives a lot number string]** — `handleDelete` sends `doc.lotNumbers[0]` as the `lotId` query parameter. This is a lot number string (e.g., `"25AJCA207B"`), not a numeric lot ID. It works for filesystem path construction (the directory IS named after the lot number), but the parameter name `lotId` is semantically misleading and could cause confusion if the server handler ever starts treating it as a numeric ID. **Note:** The requirement (DEL-3) specifies `lotId=Z` but the value is a lot number — consider renaming to `lotNumber` in both client and server for clarity.
