# Security Review — B004

**Reviewer:** Fresh agent session (independent re-review)
**Date:** 2026-04-02
**Batch:** `docs/batches/B004-requirements.md`

## Scope

B004 extracts the weekly sync pipeline from `scripts/sync-inventory.ts` into a reusable library function `lib/sync-apply.ts`, designed to be callable from both CLI and future API route handlers (B005+). Files reviewed:

- `lib/sync-apply.ts` (new — 476 lines, core library)
- `scripts/sync-inventory.ts` (modified — thin CLI wrapper delegating to `applySync()`)
- `tests/sync-apply.test.ts` (new — 237 lines, 4 test cases)
- `suppliers.md`, `warehouses.md` (auto-regenerated reference files, no security-relevant logic)

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **[lib/sync-apply.ts:73-77]** — **TOCTOU race condition in file-based lock**. `acquireLock()` performs a non-atomic check-then-write: `existsSync(lp)` (line 74) followed by `writeFileSync(lp, ...)` (line 77). Between these two calls, another process or request can pass the same check. Attack vector: when `applySync()` is exposed via an HTTP route (the explicit design goal of B004 for B005+), two concurrent requests could both pass the lock check before either writes, allowing two full DROP+re-INSERT seed cycles to run simultaneously, corrupting `lamex.db`. Impact: database corruption — duplicate rows, partial re-links, orphaned documents. Severity justification: low probability today (CLI-only), but the entire purpose of this batch is to enable API-triggered sync, making concurrent access a realistic scenario. Fix: replace with atomic exclusive-create:
  ```ts
  import { openSync, closeSync, writeFileSync, constants } from "fs";
  try {
    const fd = openSync(lp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
    closeSync(fd);
  } catch (err: any) {
    if (err.code === "EEXIST") throw new Error("Sync already in progress");
    throw err;
  }
  ```
  The OS guarantees `O_CREAT | O_EXCL` is atomic — only one process can create the file.

- **[lib/sync-apply.ts:91-98, 159, 172-178]** — **Internal file paths in error messages**. `readJson()` (line 96) includes the full `filepath` in the thrown error: `"Failed to parse JSON: ${filepath} — ${msg}"`. Snapshot and copy failures (lines 159, 172, 177) include `snapshotName` and OS-level error details. Attack vector: when a future route handler catches errors from `applySync()` and returns `err.message` in the HTTP response, internal paths like `/app/data-persist/data/inventory-proposed.json` would be exposed to the client, violating the security rule "Never expose stack traces, file paths, or internal references in API responses." Impact: information disclosure of server filesystem layout. Severity justification: not exploitable today (CLI only), but the library's JSDoc and design intent make API usage imminent. Fix: either (a) add JSDoc/comment documenting that callers must sanitise error messages before HTTP responses, or (b) introduce a typed `SyncError` class with a `code` field (e.g. `"MISSING_PROPOSED"`, `"SNAPSHOT_FAILED"`) that API callers can switch on to return generic messages.

## Minor (nice to have)

- **[lib/sync-apply.ts:445, 474]** — **Reference file writes use `process.cwd()` instead of `dataDir`**. `regenerateSuppliersMd()` and `regenerateWarehousesMd()` write to `join(process.cwd(), "suppliers.md")`, which is outside the `dataDir` parameter boundary. If `applySync()` is called from a context where `process.cwd()` differs from the expected project root (e.g. a Railway deploy with a different working directory), the files would be written to an unexpected location. No security exploit, but a consistency issue now that the function is parameterised. Suggestion: accept the project root as a parameter or derive from `dataDir`.

- **[lib/sync-apply.ts:437-440, 468-469]** — **No escaping of markdown special characters in reference files**. Supplier names and warehouse names are interpolated directly into markdown table rows. A name containing a pipe character (`|`) would break the table structure. Not exploitable (server-side writes, no rendering in a security context), but worth sanitising for robustness: `name.replace(/\|/g, "\\|").replace(/\n/g, " ")`.

- **[lib/sync-apply.ts:308-319]** — **`orphanedDocs[].originalName` in structured result**. The `original_name` column from the `documents` table (user-supplied upload filename) is included in `SyncApplyResult`. When future API routes return this data, uploaded filenames could be exposed if they contain sensitive information. Low risk given the controlled admin user base.

## Categories with No Findings

### Injection
All 10 SQL `INSERT` statements in `lib/sync-apply.ts` use parameterised prepared statements via `db.prepare("... VALUES (?, ?, ...)").run(...)`. The `DELETE` statements and `SELECT` query (lines 199-313) are static SQL strings with no interpolated values. `readJson()` wraps `JSON.parse` in try/catch (line 93). `db.exec()` calls contain only hardcoded DDL/DML. None found.

### Authentication & Authorization
No new API routes introduced. `lib/sync-apply.ts` is a server-only library module with no HTTP surface. The CLI wrapper runs locally with full filesystem access. When B005+ adds API routes calling `applySync()`, those routes must include `await auth()` + role checks — but that is outside B004's scope. None found.

### Data Exposure
- Grep for `customer`, `price`, `pricing`, `cost`, `margin`, `trader`, `finance` across all B004 files: zero matches.
- The `INSERT INTO products` statement (line 246-249) maps only public-safe fields: `product`, `commodity`, `category`, `format`, `process_type`, `specification`, `variety`, `grade`, `organic`, `pack_size`, `unit_type`, `storage_type`. No sensitive ERP fields.
- `regenerateSuppliersMd()` outputs supplier names and countries of origin — not classified as sensitive per data privacy rules (only customer names are confidential).
- CLI output (scripts/sync-inventory.ts) contains operational counts and product IDs only.
- None found.

### File Upload & Serving
No file upload or serving routes added or modified. The library reads/writes only to known internal paths (snapshots, inventory JSON, lock file, reference markdown files). No calls to `getUploadsRoot()` or `getUploadDir()`. None found.

### Configuration
- No secrets (`AUTH_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) hardcoded or logged in any batch file.
- `lib/sync-apply.ts` imports `better-sqlite3` transitively via `./db`, which is listed in `serverExternalPackages` in `next.config.ts` — will not be bundled client-side.
- No `.env.local` values referenced or logged.
- None found.

### Input Validation
- Preflight validation (lines 111-133) checks file existence and JSON structure before any mutations — fail-fast design.
- `PRAGMA foreign_keys = OFF` (line 186) is restored to `ON` in a `finally` block (line 329), guaranteeing cleanup even on transaction failure.
- Lock release is in a `finally` block (line 410), correctly scoped — `acquireLock()` is called before the `try` block, so a lock-exists throw does NOT trigger `releaseLock()` on another process's lock. Verified by test (lines 165-177).
- `proposedPath`, `inventoryPath`, and `dataDir` are currently hardcoded from the CLI wrapper. Future API callers must validate these parameters.
- None found beyond the TOCTOU issue noted above.

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — N/A, no new API routes in B004
- [x] No secrets in source code or logs
- [x] All user input validated before use in SQL queries (parameterised) — all 10 INSERT statements use `?` placeholders
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — N/A, no user-facing file paths; all paths hardcoded from CLI
- [x] No customer names, pricing, or sensitive ERP fields in any output
- [x] Unauthorised access returns 404 (not 403) for file/document routes — N/A, no new routes
- [x] File uploads validated server-side (size, MIME type, filename characters) — N/A, no upload routes
- [x] Error responses contain no stack traces, file paths, or internal details — CLI-only today (acceptable); flagged for future API callers (see Important #2)
