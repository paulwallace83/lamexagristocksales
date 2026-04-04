# B005 — Agent Sync Read Tools: Requirements

## Functional

- [ ] `get_reference_data` tool defined in `TOOL_DEFINITIONS` with no input params
- [ ] `get_reference_data` returns `{ suppliers: [...], warehouses: [...] }` matching content of `data/suppliers.json` and `data/warehouses.json`
- [ ] `get_reference_data` returns `{ error: "..." }` if either file cannot be read
- [ ] `save_proposed_inventory` tool defined in `TOOL_DEFINITIONS` with `products` array input
- [ ] `save_proposed_inventory` validates `products` is a non-empty array; returns `{ success: true, productCount, path }` on success
- [ ] `save_proposed_inventory` writes `data/inventory-proposed.json` with `JSON.stringify(data, null, 2)`
- [ ] `save_proposed_inventory` rejects missing `products` — returns `{ error: "..." }`
- [ ] `save_proposed_inventory` rejects non-array `products` — returns `{ error: "..." }`
- [ ] `save_proposed_inventory` rejects empty `products: []` — returns `{ error: "..." }`
- [ ] `save_proposed_inventory` listed as an action tool in system prompt rule 1 (confirmation required)
- [ ] `run_sync_diff` tool defined in `TOOL_DEFINITIONS` with no input params
- [ ] `run_sync_diff` returns `{ report, warnings, summary }` when both `inventory.json` and `inventory-proposed.json` exist
- [ ] `run_sync_diff` returns `{ error: "..." }` if `inventory-proposed.json` is missing
- [ ] `run_sync_diff` returns `{ error: "..." }` if `inventory.json` is missing
- [ ] System prompt includes new rule (14) with sync workflow instructions
- [ ] System prompt capabilities list updated to include sync workflow
- [ ] `agent_docs/agent-tdpaib.md` tool count updated to 22 (14 read-only, 8 action)

## Error Handling

- [ ] `get_reference_data` wraps file reads in try/catch — returns structured error, never throws
- [ ] `save_proposed_inventory` wraps `writeFileSync` in try/catch — returns structured error on disk failure
- [ ] `run_sync_diff` wraps `computeDiff()` in try/catch — returns structured error if diff computation fails (e.g., malformed JSON in either file)
- [ ] All 3 tools return objects (not raw strings) — consistent with existing tool response pattern

## Edge Cases

- [ ] `save_proposed_inventory` with `products: null` — returns error (not crash)
- [ ] `save_proposed_inventory` with `products: 123` — returns error (not crash)
- [ ] `run_sync_diff` when `inventory-proposed.json` exists but contains invalid JSON — returns error from `computeDiff()`
- [ ] `get_reference_data` when `suppliers.json` exists but `warehouses.json` is missing — returns error

## Tests

All in `tests/agent-sync-tools.test.ts`:

- [ ] `get_reference_data` — returns suppliers and warehouses arrays from mocked file reads
- [ ] `save_proposed_inventory` — happy path: valid products array → `{ success: true, productCount }`
- [ ] `save_proposed_inventory` — invalid: `products` is not an array → error
- [ ] `save_proposed_inventory` — invalid: `products` is empty array → error
- [ ] `save_proposed_inventory` — invalid: `products` is missing → error
- [ ] `run_sync_diff` — happy path: both files exist → returns `{ report, warnings, summary }`
- [ ] `run_sync_diff` — missing proposed file → error
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` passes with no regressions
