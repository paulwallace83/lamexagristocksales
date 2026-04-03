# B005 — Agent Sync Read Tools

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Goal

Give the TDPAIB agent the read-only tools it needs to support the weekly sync workflow: access to reference data (suppliers, warehouses), the ability to write `inventory-proposed.json`, and the ability to run `computeDiff()` to produce a diff report. After this batch, Paul can paste pivot table data into the agent chat, and the agent can parse it, write the proposed file, and show the diff — all within the chat interface.

---

## Background

Today the weekly sync starts with Paul pasting pivot table data into a Claude Code session. Claude Code parses it using `suppliers.json` and `warehouses.json` for resolution, writes `inventory-proposed.json`, then runs `computeDiff()` to show the diff report.

The TDPAIB agent (Claude Sonnet in `/admin/agent`) has the same Claude intelligence but lacks the tools to read reference data or interact with the sync pipeline. This batch adds three new tools:

1. **`get_reference_data`** — Returns full `suppliers.json` and `warehouses.json` so the agent can resolve suppliers/warehouses/COO when parsing pasted pivot data.
2. **`save_proposed_inventory`** — Writes `data/inventory-proposed.json` from a structured products array. This is the agent's equivalent of Claude Code writing the file directly.
3. **`run_sync_diff`** — Calls `computeDiff()` from `lib/sync.ts` and returns the formatted diff report + raw warnings.

These are the prerequisite tools for B006 (write tools that actually apply the sync).

---

## Scope

### In scope
- Three new tool definitions added to `TOOL_DEFINITIONS` in `lib/agent-tools.ts`
- Tool execution logic in the `executeTool` switch
- System prompt update in `app/api/agent/chat/route.ts` to instruct the agent on the weekly sync workflow
- `get_reference_data` returns the full content of `data/suppliers.json` and `data/warehouses.json`
- `save_proposed_inventory` validates the input structure (`{ products: [...] }`) and writes `data/inventory-proposed.json`
- `run_sync_diff` calls `computeDiff()` and returns both the formatted markdown report and the raw `SyncDiff` warnings array

### Out of scope
- Applying the sync (B006)
- Dry-run mode (B007)
- Excel import via agent (the agent handles pasted pivot data, not Excel files)
- Reconciliation report tool (added in B006 alongside apply)

---

## Acceptance Criteria

1. `get_reference_data` tool returns `{ suppliers: [...], warehouses: [...] }` matching the content of `data/suppliers.json` and `data/warehouses.json`.
2. `save_proposed_inventory` validates that `products` is a non-empty array. Returns `{ success: true, productCount, path }` on success.
3. `save_proposed_inventory` rejects input where `products` is missing or not an array — returns `{ error: "..." }`.
4. `save_proposed_inventory` is an action tool — requires user confirmation before execution (added to the confirmation list in the system prompt).
5. `run_sync_diff` returns `{ report: "## Inventory Sync Report...", warnings: [...], summary: {...} }` when `inventory-proposed.json` and `inventory.json` both exist.
6. `run_sync_diff` returns `{ error: "..." }` if either file is missing.
7. System prompt includes a new section explaining the sync workflow the agent should follow when the user pastes pivot data.
8. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/agent-tools.ts` | Add 3 tool definitions to `TOOL_DEFINITIONS`. Add 3 cases to `executeTool` switch. |
| `app/api/agent/chat/route.ts` | Extend `SYSTEM_PROMPT` with sync workflow instructions. Add `save_proposed_inventory` to the confirmation-required tool list (rule 1). |
| `tests/agent-sync-tools.test.ts` | New test — verify tool input validation, diff report generation, reference data shape. |

**Do not modify:**
- `lib/sync.ts` — `computeDiff()` and `formatDiffReport()` used as-is
- `scripts/sync-inventory.ts` — CLI script unchanged
- `data/suppliers.json`, `data/warehouses.json` — read-only access

---

## Test Plan

`tests/agent-sync-tools.test.ts`:

- **get_reference_data:** Mock `fs.readFileSync` for suppliers/warehouses JSON. Verify returned structure has `suppliers` array and `warehouses` array.
- **save_proposed_inventory — happy path:** Mock `fs.writeFileSync`. Call with valid `{ products: [{...}] }`. Verify it writes to the correct path and returns `{ success: true, productCount: 1 }`.
- **save_proposed_inventory — invalid input:** Call with `{ products: "not an array" }`. Verify returns `{ error: "..." }`.
- **save_proposed_inventory — empty products:** Call with `{ products: [] }`. Verify returns `{ error: "..." }`.
- **run_sync_diff — happy path:** Mock `computeDiff()` and `formatDiffReport()`. Verify returns `{ report, warnings, summary }`.
- **run_sync_diff — missing proposed file:** Mock `fs.existsSync` to return false for proposed path. Verify returns `{ error: "..." }`.

Bootstrap:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/sync", () => ({
  computeDiff: vi.fn(),
  formatDiffReport: vi.fn(),
}));
```

---

## Notes

- `get_reference_data` returns the full JSON so the agent can resolve any supplier/warehouse during pivot parsing. The data is ~5-10KB total — well within context limits.
- `save_proposed_inventory` writes the raw JSON without validation of individual product fields. Field-level validation happens downstream in `computeDiff()` which produces warnings for missing COO, invalid unit types, etc.
- The agent system prompt sync workflow should instruct:
  1. When user pastes pivot data, first call `get_reference_data` to get supplier/warehouse lookups.
  2. Parse the pivot data following the row structure (Row 1: description, Row 2: warehouse, Row 3: customer name — STRIP, Row 4: supplier + contract).
  3. Call `save_proposed_inventory` with the parsed products (after user confirmation).
  4. Call `run_sync_diff` to show the diff report.
  5. Help the user resolve any warnings (missing COO, unknown warehouses).
  6. Once all warnings are resolved, tell the user they can apply the sync (B006 tool).

---

## Definition of Done

- [ ] Three new tools added to `TOOL_DEFINITIONS` and `executeTool`
- [ ] System prompt extended with sync workflow instructions
- [ ] `save_proposed_inventory` in the confirmation-required tool list
- [ ] All tools return structured results (not raw strings)
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
