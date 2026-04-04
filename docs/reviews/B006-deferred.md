# Deferred Findings — Batch B006

| # | Source | Severity | File | Finding | Reason Deferred | Target Batch | Status |
|---|--------|----------|------|---------|----------------|-------------|--------|
| D1 | integration | Minor | lib/agent-tools.ts | `apply_sync` doesn't pre-validate file existence like `run_sync_diff` does — generic "Sync failed" gives no actionable guidance | Requirements explicitly designed this way (EC1-EC3); system prompt rule 14 enforces workflow order ensuring files exist | B007 | RESOLVED — B007 refactor added 4-file pre-validation to both `apply_sync` and `dry_run_sync` |
| D2 | correctness | Minor | tests/agent-sync-tools.test.ts | `resetAllMocks` in beforeEach strips default `fs` mock implementations — future tests relying on `readFileSync` delegation would get `undefined` | No current bug; only relevant if future tests are added without setting their own mocks | TBD | OPEN |
| D3 | retro | Minor | tests/agent-sync-tools.test.ts | `apply_sync` happy path test doesn't assert the arguments passed to `applySync()` (paths constructed from `process.cwd()`) | Paths are hardcoded, not user-derived — low risk of regression | TBD | OPEN |
| D4 | retro | Minor | tests/agent-sync-tools.test.ts | `mockResult` in apply_sync test is cast to `any` — importing `SyncApplyResult` type would catch field name drift | Requires `vi.importActual` for the type; minor improvement | TBD | OPEN |
| D5 | retro | Minor | lib/agent-tools.ts | `TOOL_DEFINITIONS` array has mixed read/action tools in trailing block; could be reordered to match `executeTool` switch grouping | Existing pattern from prior batches; cosmetic only | TBD | OPEN |
