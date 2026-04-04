# Deferred Findings — Batch B007

| # | Source | Severity | File | Finding | Reason Deferred | Target Batch | Status |
|---|--------|----------|------|---------|----------------|-------------|--------|
| D1 | integration + retro | Minor | lib/agent-tools.ts | Path construction (`dataDir`, `proposedPath`, `inventoryPath`) duplicated across 6 sync tool cases — a shared `getSyncPaths()` helper would reduce duplication | Pre-existing from B005/B006; cosmetic; would touch all sync tools for no functional benefit | TBD | OPEN |
| D2 | retro | Future | lib/sync-apply.ts | Dry-run lot count may be higher than real sync if duplicate lot numbers exist within a listing (dry-run counts raw JSON entries without dedup) | Accepted design trade-off — dry-run reports "input counts"; duplicate lots are rare in practice | TBD | OPEN |
