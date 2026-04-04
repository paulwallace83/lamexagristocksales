# Security Review — B007

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B007-sync-dry-run.md

## Scope

B007 adds dry-run mode to the sync pipeline: a `dryRun` option on `applySync()`, a `--dry-run` CLI flag on `scripts/sync-inventory.ts`, and a `dry_run_sync` agent tool. Files reviewed:

| File | B007 Changes |
|------|-------------|
| `lib/sync-apply.ts` | `dryRun?: boolean` on `SyncApplyOptions`, `dryRun: boolean` on `SyncApplyResult`, early-return dry-run path that counts without writing |
| `scripts/sync-inventory.ts` | `--dry-run` argv flag, `[DRY RUN]` output prefix, `process.exit(0)` on dry-run |
| `lib/agent-tools.ts` | `dry_run_sync` tool definition + execution case |
| `app/api/agent/chat/route.ts` | System prompt rule 14 g2 addition, capabilities bullet update |
| `tests/sync-apply.test.ts` | Dry-run test suite (counts, no files, no DB, lock cleanup, preflight errors) |
| `tests/agent-sync-tools.test.ts` | `dry_run_sync` tool tests (happy path, missing files, lock, generic error, QA role access) |

---

## Critical (must fix before merge)

None found.

---

## Important (should fix, can be next batch)

None found.

---

## Minor (nice to have)

None found.

---

## Detailed Analysis by Category

### Injection

**SQL injection:** None found. The dry-run path in `applySync()` (sync-apply.ts lines 165–195) returns **before** any database interaction. It parses JSON files with `readJson()` (which wraps `JSON.parse` in try/catch) and counts entries in-memory. `getDb()` is never called during a dry-run — test T4 at sync-apply.test.ts line 441 explicitly verifies this. The `dry_run_sync` agent tool adds no SQL queries.

**Path traversal:** None found. The dry-run path uses the same server-side path construction as the real sync (`join(process.cwd(), "data", ...)` with hardcoded filenames). No user-supplied path segments are introduced. The `dry_run_sync` agent tool has zero parameters (`input_schema: { properties: {}, required: [] }`), and path construction at agent-tools.ts lines 1002–1004 uses hardcoded segments only. The CLI script reads `--dry-run` as a boolean flag from `process.argv` — it never uses the flag value in a path.

**JSON.parse safety:** The dry-run path reuses `readJson()` in `lib/sync-apply.ts` (lines 111–127), which wraps both `readFileSync` and `JSON.parse` in individual try/catch blocks. No new `JSON.parse` calls added in B007.

### Authentication & Authorization

**`dry_run_sync` is NOT in `REVIEWER_ONLY_TOOLS`:** This is correct by design. The tool is read-only — it validates JSON structure and counts entries without modifying any data. Per B007 requirements (F14): "accessible to both `qa` and `reviewer` roles." The route handler auth guard (route.ts lines 73–83) still requires either `qa` or `reviewer` session. Test at agent-sync-tools.test.ts lines 555–581 explicitly verifies QA role can access the tool.

**`dry_run_sync` is NOT in the system prompt's confirmation-required list (rule 1):** Correct. It's a read-only operation. The tool does acquire a file lock, but this is a brief hold (milliseconds for JSON parsing) and is released in the `finally` block — no lasting side effect.

**CLI flag requires shell access:** The `--dry-run` flag on `scripts/sync-inventory.ts` is only accessible to operators with terminal access to the server. No auth bypass risk.

### Data Exposure

**Dry-run result contains no sensitive data:** The `SyncApplyResult` returned by the dry-run path contains only:
- Numeric counts: `productCount`, `listingCount`, `contractCount`, `lotCount`, `warehouseCount`, `supplierCount`
- Fixed placeholder values: `snapshotPath: "(dry run)"`, `documentsPreserved: 0`, etc.

No customer names, pricing, file paths, trader codes, or other sensitive fields. The agent tool further reduces the output at agent-tools.ts lines 1020–1029, returning only the six count fields.

**Generic error messages:** The `dry_run_sync` error handler at agent-tools.ts lines 1031–1038 follows the same pattern as `apply_sync`:
- `"Sync already in progress"` for lock conflicts (safe — no path info)
- `"Dry-run failed"` for all other errors

Full errors logged server-side via `console.error`. Test at agent-sync-tools.test.ts lines 543–553 verifies no internal paths leak (`"/internal/"` assertion).

**CLI output is terminal-only:** The `[DRY RUN]` summary in `scripts/sync-inventory.ts` (lines 23–33) prints counts to `console.log`. No sensitive data in CLI output — just structural counts.

### File Upload & Serving

No file upload or serving changes in B007. The dry-run path writes no files by design — test T1 at sync-apply.test.ts lines 415–436 verifies `inventory.json` is byte-identical after dry-run, no snapshot is created, and the proposed file is not deleted.

### Configuration

**No secrets hardcoded:** Reviewed all B007 diffs. No API keys, auth secrets, or credentials in any changed line.

**No client-side server module imports:** The `dry_run_sync` tool code runs in `lib/agent-tools.ts` (server-only). The import of `applySync` from `lib/sync-apply.ts` is pre-existing from B006 and correctly server-side only.

### Input Validation

**`dry_run_sync` agent tool — zero parameters:** Tool definition at agent-tools.ts lines 366–371 specifies empty input schema. The execution handler at lines 1001–1039 pre-validates file existence with `existsSync()` before calling `applySync()`, returning specific error messages for missing `inventory-proposed.json` and `inventory.json`. No user input reaches any function.

**CLI `--dry-run` flag — boolean only:** `process.argv.includes("--dry-run")` at scripts/sync-inventory.ts line 17 produces a boolean. The flag value is never used as a string in paths or queries. No injection vector.

**Dry-run early return in `applySync()`:** The `options.dryRun` check at sync-apply.ts line 165 returns immediately after JSON parsing and counting. The code path between lock acquisition (line 137) and the dry-run return (line 195) only calls `readJson()` three times (proposed, suppliers, warehouses) and iterates the in-memory `products` array. No database, no file writes, no external calls. Lock is released in the `finally` block at line 515.

---

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — No new API routes. `dry_run_sync` executes within existing auth-guarded `POST /api/agent/chat`. Read-only tool correctly accessible to both `qa` and `reviewer`.
- [x] No secrets in source code or logs — No secrets introduced in B007. Error messages are generic strings. Full errors logged server-side only.
- [x] All user input validated before use in SQL queries (parameterised) — No SQL queries in dry-run path. `getDb()` is never called. Verified by test.
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — Zero user-controlled parameters. All paths hardcoded server-side. CLI flag is a boolean check, not a path segment.
- [x] No customer names, pricing, or sensitive ERP fields in any output — Dry-run result contains only numeric counts and placeholder strings. Agent tool further reduces output to six count fields.
- [x] Unauthorised access returns 404 (not 403) for file/document routes — No new file-serving routes in B007.
- [x] File uploads validated server-side (size, MIME type, filename characters) — No new file upload functionality in B007.
- [x] Error responses contain no stack traces, file paths, or internal details — Lock conflict returns safe specific message. All other errors return `"Dry-run failed"`. Tests verify no path leakage.
