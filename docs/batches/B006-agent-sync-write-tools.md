# B006 — Agent Sync Write Tools (Apply & Reconcile)

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Depends On
- B004 (must be merged first) — `applySync()` library function
- B005 (must be merged first) — read tools that produce `inventory-proposed.json` and diff report

---

## Goal

Give the TDPAIB agent the ability to apply an approved sync and generate the reconciliation report — the final two steps needed to complete a weekly sync entirely within the agent chat. After this batch, Paul can do the full sync workflow end-to-end in `/admin/agent` with no terminal access.

---

## Background

After B005, the agent can parse pivot data, write `inventory-proposed.json`, and show a diff report. But applying the sync still requires running `npm run sync` in the terminal. B004 extracted `applySync()` into `lib/sync-apply.ts`, making it callable from a route handler.

This batch adds two new tools:
1. **`apply_sync`** — Calls `applySync()` from `lib/sync-apply.ts`. This is the agent's equivalent of `npm run sync`. Returns the full structured result (snapshot path, counts, re-link reports, deduction, new arrivals).
2. **`get_reconciliation`** — Calls `reconciliationReport()` from `lib/sync.ts`. Returns the per-product quantity/weight table for Paul to cross-check against ERP data.

Both are action tools requiring explicit user confirmation.

---

## Scope

### In scope
- Two new tool definitions in `TOOL_DEFINITIONS`
- Tool execution logic calling `applySync()` and `reconciliationReport()`
- System prompt update: add both tools to the confirmation-required list, add reconciliation step to the sync workflow instructions
- `apply_sync` returns the full `SyncApplyResult` from B004
- `get_reconciliation` returns the formatted markdown table

### Out of scope
- Dry-run mode (B007)
- Email trigger (B008)
- Modifying `lib/sync-apply.ts` (already done in B004)
- Excel import via agent

---

## Acceptance Criteria

1. `apply_sync` tool calls `applySync()` and returns `{ success: true, result: SyncApplyResult }` on success.
2. `apply_sync` returns `{ error: "Sync already in progress" }` if the lock file exists (concurrent sync protection from B004).
3. `apply_sync` returns `{ error: "..." }` with a descriptive message if `applySync()` throws (e.g., missing proposed file, invalid JSON).
4. `apply_sync` requires user confirmation before execution (listed in system prompt rule 1).
5. `get_reconciliation` returns `{ report: "## Reconciliation Report..." }` when `inventory.json` exists.
6. `get_reconciliation` returns `{ error: "..." }` when `inventory.json` is missing.
7. System prompt sync workflow instructions include: after apply_sync succeeds, call `get_reconciliation` and present the table for the user to cross-check. Sync is not complete until the user signs off on reconciliation.
8. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/agent-tools.ts` | Add 2 tool definitions to `TOOL_DEFINITIONS`. Add 2 cases to `executeTool` switch. Import `applySync` from `lib/sync-apply.ts` and `reconciliationReport` from `lib/sync.ts`. |
| `app/api/agent/chat/route.ts` | Extend system prompt: add `apply_sync` and `get_reconciliation` to confirmation-required tools list. Add reconciliation step to sync workflow. |
| `tests/agent-sync-tools.test.ts` | Extend existing test file from B005 — add tests for apply_sync and get_reconciliation tools. |

**Do not modify:**
- `lib/sync-apply.ts` — use as-is from B004
- `lib/sync.ts` — `reconciliationReport()` used as-is
- `scripts/sync-inventory.ts` — CLI script unchanged

---

## Test Plan

Extend `tests/agent-sync-tools.test.ts`:

- **apply_sync — happy path:** Mock `applySync()` to return a valid `SyncApplyResult`. Verify tool returns `{ success: true, result: {...} }`.
- **apply_sync — lock conflict:** Mock `applySync()` to throw `"Sync already in progress"`. Verify tool returns `{ error: "Sync already in progress" }`.
- **apply_sync — missing proposed:** Mock `applySync()` to throw. Verify tool returns `{ error: "..." }`.
- **get_reconciliation — happy path:** Mock `reconciliationReport()` to return a markdown string. Verify tool returns `{ report: "..." }`.
- **get_reconciliation — missing inventory:** Mock `reconciliationReport()` to throw. Verify tool returns `{ error: "..." }`.

Bootstrap:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/sync-apply", () => ({ applySync: vi.fn() }));
vi.mock("../lib/sync", () => ({ reconciliationReport: vi.fn() }));
```

---

## Notes

- `apply_sync` is the single most consequential action tool in the system. The system prompt must make it absolutely clear that the agent should never call it without explicit user approval, and should first show the diff report (from `run_sync_diff`) so the user can review changes.
- The agent should present a clear summary of what `apply_sync` will do: "This will snapshot the current inventory, replace it with the proposed data, re-seed the database, re-link documents and COA data, and deduct discount lots."
- After apply_sync, the agent must immediately call `get_reconciliation` and present the table. The sync workflow is not complete until Paul confirms the reconciliation figures match the ERP.
- `apply_sync` accepts no parameters — it reads `inventory-proposed.json` and `inventory.json` from the standard `data/` directory. The paths are resolved server-side, not passed from the client.

---

## Definition of Done

- [ ] `apply_sync` and `get_reconciliation` tools added
- [ ] Both tools in confirmation-required list in system prompt
- [ ] Sync workflow instructions cover the full cycle (paste → parse → save → diff → resolve → apply → reconcile → sign off)
- [ ] Error cases return structured `{ error }` responses
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
