# Security Review — B006

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** `docs/batches/B006-requirements.md`

## Scope

B006 adds 2 new agent tools to `lib/agent-tools.ts` and extends the system prompt in `app/api/agent/chat/route.ts`:

- `apply_sync` (action) — full inventory replacement via `applySync()` from `lib/sync-apply.ts`
- `get_reconciliation` (read-only) — generates per-product qty/weight reconciliation table via `reconciliationReport()` from `lib/sync.ts`

Files reviewed: `lib/agent-tools.ts` (tool definitions at lines 354-367, execution at lines 704-716 and 949-988), `app/api/agent/chat/route.ts` (full file — auth model, system prompt rules 1 and 14h-j), `tests/agent-sync-tools.test.ts` (apply_sync and get_reconciliation test suites), `lib/sync-apply.ts` (SyncApplyResult type, lock mechanism, orphanedDocs structure), `lib/sync.ts` (reconciliationReport signature).

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **[lib/agent-tools.ts:949-988](lib/agent-tools.ts#L949-L988)** — **Missing role gate on `apply_sync` (Authorization)**. `apply_sync` is the single most consequential action in the system — it replaces the entire inventory, re-seeds the database, re-links all documents and COA data, and deducts discount lots. The chat route (`app/api/agent/chat/route.ts:73-82`) allows both `qa` and `reviewer` roles to access the agent. Per the Architecture doc's surface-to-role mapping, the weekly sync workflow is `reviewer`-only (`/review` requires `reviewer`; `/admin/tools` requires `reviewer`). However, `executeTool()` receives no role information — its signature is `(toolName, input, fileMap, uploaderEmail)`. A `qa` user can walk through the full sync workflow (paste data → save proposed → diff → apply) with no code-level barrier. The system prompt's confirmation requirement (rule 1) is enforced by the AI model, not by application code — it is a soft control that could be bypassed by creative prompting. Attack vector: A `qa` user opens `/admin/agent`, proceeds through the sync workflow, confirms when prompted, and triggers `apply_sync`. Impact: Full inventory replacement by an under-privileged user. Fix: Pass `session.user.role` into `executeTool()` and reject `apply_sync` (and `save_proposed_inventory` from B005) unless the role is `reviewer`. Alternatively, filter `TOOL_DEFINITIONS` sent to the Anthropic API based on role so the model never sees sync action tools for `qa` users.

## Minor (nice to have)

- **[lib/agent-tools.ts:958-959](lib/agent-tools.ts#L958-L959)** — **Snapshot path sanitisation uses string splitting**. The relative path extraction uses `.split("data/snapshots/").pop()` which works correctly for all realistic paths but is brittle — if the absolute path ever contained a nested `data/snapshots/` segment, it would produce a truncated result. Suggestion: Use `path.basename(result.snapshotPath)` to extract just the filename, since the snapshot filename is a date-stamped string generated internally by `applySync()`, not user input:
  ```ts
  const relativeSnapshot = "data/snapshots/" + path.basename(result.snapshotPath);
  ```

- **[lib/agent-tools.ts:972](lib/agent-tools.ts#L972)** — **`orphanedDocs` array includes `originalName`**. The `apply_sync` result passes through `orphanedDocs` which includes `originalName` — a user-supplied filename from a prior upload. This is sent over SSE to the AI model, which may echo it to the user. The B006 requirements doc (EC5) explicitly acknowledges this as safe since both the uploader and viewer are authenticated staff. The TODO in `lib/sync-apply.ts:52` already flags it for future review. No action needed now.

## Observations (no action needed)

- **Error handling is correctly implemented.** The `apply_sync` handler distinguishes the lock conflict error (`"Sync already in progress"`) by exact string match and returns it directly — this is a user-actionable message, not an internal detail. All other errors return the generic `"Sync failed"` with the full error logged server-side via `console.error`. The `get_reconciliation` handler follows the same pattern: generic `"Failed to generate reconciliation report"` for any exception. The test suite (T3, T6) explicitly verifies no path leakage in error responses.

- **No user-controlled input reaches file paths.** Both `apply_sync` and `get_reconciliation` have empty input schemas — no parameters at all. All file paths are constructed from `process.cwd()` + hardcoded segments (`"data"`, `"inventory-proposed.json"`, `"inventory.json"`). No path traversal risk.

- **No new SQL queries.** `get_reconciliation` reads from `inventory.json` (filesystem, not DB). `apply_sync` delegates to `applySync()` which uses parameterised `better-sqlite3` queries internally.

- **`get_reconciliation` output contains no sensitive data.** The `reconciliationReport()` function returns a per-product markdown table with product name, unit type, total quantity, and total weight. No customer names, pricing, trader codes, or other sensitive ERP fields.

- **System prompt correctly updated.** `apply_sync` is added to rule 1's confirmation-required list. Rule 14h-j describes the apply → reconcile → sign-off workflow with explicit approval gates. The model is instructed to summarise what `apply_sync` will do before calling it and to require explicit reconciliation sign-off before declaring the sync complete.

- **`applySync()` has its own mutex.** The file-based lock (`data/.sync-lock`) in `lib/sync-apply.ts` prevents concurrent syncs regardless of how `apply_sync` is triggered (CLI or agent tool). This is a defence-in-depth control.

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — No new API routes added. Both tools execute within `executeTool()` called from `app/api/agent/chat/route.ts`, gated by `qa` or `reviewer` session check (lines 73-82). **Note:** role-level granularity within `executeTool()` is missing — see Important finding above.
- [x] No secrets in source code or logs — No secrets introduced. Error messages use generic strings. `console.error` logs are server-side only.
- [x] All user input validated before use in SQL queries (parameterised) — No new SQL queries. `applySync()` uses parameterised better-sqlite3 queries internally.
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — All file paths constructed from hardcoded filenames joined to `process.cwd()/data`. No user-controlled path segments. Snapshot path explicitly sanitised to relative before returning to client.
- [x] No customer names, pricing, or sensitive ERP fields in any output — `reconciliationReport()` returns product-level totals only. `apply_sync` result contains counts, re-link reports, and `orphanedDocs` (acknowledged safe — see Minor finding). Snapshot path stripped of absolute prefix.
- [x] Unauthorised access returns 404 (not 403) for file/document routes — No new file-serving routes added.
- [x] File uploads validated server-side (size, MIME type, filename characters) — No new file upload functionality.
- [x] Error responses contain no stack traces, file paths, or internal details — Both tools return generic error messages. Lock conflict message is intentionally specific ("Sync already in progress"). Tests verify no path leakage.
