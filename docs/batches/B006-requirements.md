# B006 Requirements — Agent Sync Write Tools (Apply & Reconcile)

**Batch:** B006
**Date:** 2026-04-04
**Status:** Approved

---

## Functional

### apply_sync tool

- [ ] F1: `apply_sync` tool definition exists in `TOOL_DEFINITIONS` with no input parameters
- [ ] F2: `apply_sync` calls `applySync()` from `lib/sync-apply.ts` with server-side constructed paths (`dataDir`, `proposedPath`, `inventoryPath` from `process.cwd()`)
- [ ] F3: On success, returns `{ success: true, result: { ...SyncApplyResult } }` including counts (productCount, listingCount, contractCount, lotCount, warehouseCount, supplierCount), documentsPreserved, orphanedDocs, relinkReport, coaRelinkReport, deductionReport, newArrivals
- [ ] F4: `snapshotPath` in the result is stripped to a relative path (no absolute filesystem paths exposed)
- [ ] F5: `apply_sync` is listed in system prompt rule 1 confirmation-required tools
- [ ] F6: `apply_sync` case is placed in the action tools section of `executeTool` switch

### get_reconciliation tool

- [ ] F7: `get_reconciliation` tool definition exists in `TOOL_DEFINITIONS` with no input parameters
- [ ] F8: `get_reconciliation` calls `reconciliationReport()` from `lib/sync.ts` with `data/inventory.json` path
- [ ] F9: On success, returns `{ report: "<markdown string>" }`
- [ ] F10: `get_reconciliation` does NOT require user confirmation (read-only tool)
- [ ] F11: `get_reconciliation` case is placed in the read-only tools section of `executeTool` switch

### System prompt

- [ ] F12: Capabilities bullet updated to mention applying syncs and generating reconciliation reports
- [ ] F13: Rule 14 extended with steps i (apply with summary of what it does), j (immediately call get_reconciliation and present table), k (sync not complete until user confirms reconciliation)
- [ ] F14: Rule 14h updated: after warnings resolved and user approves, proceed to apply (replaces current "tell the user the proposed inventory is ready to apply")

### Documentation

- [ ] F15: `agent_docs/agent-tdpaib.md` tool count updated to 24 (15 read-only, 9 action)
- [ ] F16: `agent_docs/agent-tdpaib.md` action tools list includes `apply_sync`
- [ ] F17: `agent_docs/agent-tdpaib.md` capabilities section includes sync apply + reconciliation bullet
- [ ] F18: `CLAUDE.md` batch queue updated: B006 status to `in-progress`

---

## Error Handling

### apply_sync errors

- [ ] E1: When lock file exists (`"Sync already in progress"`), returns `{ error: "Sync already in progress" }`
- [ ] E2: When `applySync()` throws any other error, logs full error server-side via `console.error`, returns `{ error: "Sync failed" }` — no raw error message, no filesystem paths
- [ ] E3: Error message for lock conflict is matched by exact string comparison against `"Sync already in progress"` to distinguish from generic failures

### get_reconciliation errors

- [ ] E4: When `inventory.json` does not exist, returns `{ error: "No inventory.json found. Run a sync first." }` without calling `reconciliationReport()`
- [ ] E5: When `reconciliationReport()` throws, logs full error server-side, returns `{ error: "Failed to generate reconciliation report" }` — no raw error leakage

---

## Edge Cases

- [ ] EC1: `apply_sync` called when `inventory-proposed.json` does not exist — `applySync()` throws, tool returns generic `{ error: "Sync failed" }`
- [ ] EC2: `apply_sync` called when `inventory.json` does not exist — `applySync()` throws, tool returns generic `{ error: "Sync failed" }`
- [ ] EC3: `apply_sync` called when `suppliers.json` or `warehouses.json` missing — same generic error
- [ ] EC4: `apply_sync` result has empty `newArrivals` array — tool still returns full result with `newArrivals: []`
- [ ] EC5: `apply_sync` result has non-empty `orphanedDocs` — tool returns them in result (originalName is from authenticated upload, safe to include)
- [ ] EC6: `get_reconciliation` called immediately after `apply_sync` — reads the freshly written `inventory.json`, returns correct reconciliation for new data

---

## Tests

Extend `tests/agent-sync-tools.test.ts`:

### apply_sync tests

- [ ] T1: Happy path — mock `applySync` returning valid `SyncApplyResult`. Assert returns `{ success: true, result: {...} }` with all expected fields. Assert `snapshotPath` does not contain absolute path prefix.
- [ ] T2: Lock conflict — mock `applySync` throwing `Error("Sync already in progress")`. Assert returns `{ error: "Sync already in progress" }`.
- [ ] T3: General failure — mock `applySync` throwing `Error("File not found: /srv/data/inventory-proposed.json")`. Assert returns `{ error: "Sync failed" }`. Assert response does NOT contain `/srv/` or raw error text.

### get_reconciliation tests

- [ ] T4: Happy path — mock `existsSync` true, mock `reconciliationReport` returning markdown string. Assert returns `{ report: "## Reconciliation Report..." }`.
- [ ] T5: Missing inventory — mock `existsSync` false for inventory.json path. Assert returns error about missing inventory. Assert `reconciliationReport` was NOT called.
- [ ] T6: Throw — mock `existsSync` true, mock `reconciliationReport` throwing. Assert returns `{ error: "Failed to generate reconciliation report" }`. Assert no raw error in response.

### Build verification

- [ ] T7: `npx tsc --noEmit` passes clean
- [ ] T8: `npm test` passes — all existing + new tests green
