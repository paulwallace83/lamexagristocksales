# Integration Review — B007

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B007-sync-dry-run.md

## Critical (must fix before merge)

None.

## Important (should fix, can be next batch)

- **[lib/agent-tools.ts: `dry_run_sync` (L1001–1039) vs `run_sync_diff` (L687–714) vs `apply_sync` (L962–998)]** — Pre-validation depth is inconsistent across the three sync-related tools. `run_sync_diff` pre-validates all 4 required files (`inventory-proposed.json`, `inventory.json`, `suppliers.json`, `warehouses.json`) with specific, actionable error messages. `dry_run_sync` (B007) pre-validates only 2 of 4 (`inventory-proposed.json`, `inventory.json`). `apply_sync` (B006) pre-validates 0 of 4 — all failures surface as generic "Sync failed". When `suppliers.json` or `warehouses.json` is missing, `dry_run_sync` returns "Dry-run failed" and `apply_sync` returns "Sync failed" — neither tells the user which file is missing. `run_sync_diff` at L700–705 is the reference pattern. Impact on future: this same issue was noted as B006-D1 in the B005 review cycle and remains partially addressed. If `apply_sync` or `dry_run_sync` is called with a missing reference file, the LLM gets a generic error and must guess what went wrong.

## Minor (nice to have)

- **[app/api/agent/chat/route.ts: L58]** — System prompt step `g2` naming is unconventional. All other sync workflow steps use single-letter labels (`a` through `j`). If future batches add more steps, the numbering scheme becomes ambiguous (is the next step `g3` or `h`?). Reference: existing steps `a`–`j` at L52–61. Low impact — the LLM consumes this as prose, not structured data.

- **[lib/agent-tools.ts: L1001–1039, L962–998, L687–714, L940–958]** — Path construction (`const dataDir = join(process.cwd(), "data"); const proposedPath = ...`) is duplicated across `dry_run_sync`, `apply_sync`, `run_sync_diff`, `save_proposed_inventory`, and `get_reconciliation` — 5 instances of the same 2–3 lines. A `getSyncPaths()` helper would reduce duplication. Pre-existing from B005/B006; B007 adds a 6th instance. Flagged in the B007 retro as a future item.

- **[tests/agent-sync-tools.test.ts: L367–379]** — The `apply_sync` happy-path test mock does not include the new `dryRun: false` field on `SyncApplyResult` (introduced by B007's interface change to `lib/sync-apply.ts:62`). Masked by `as any` cast at L379. The newer B007 `dry_run_sync` tests at L471–499 correctly include `dryRun: true` in their mocks. Not a bug, but if `as any` is ever removed the test won't compile. Reference: `SyncApplyResult` at `lib/sync-apply.ts:61`.

- **[CLAUDE.md: L100]** — Test count reads "115 tests" but actual count is 125 (verified: `npm test` reports 125 passed). Should be updated when the batch is closed.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A: dry-run stores no data
- [x] New tables/columns added to the "preserved during sync" path (if applicable) — N/A: no schema changes
- [x] Migration block in `lib/db.ts` for any schema changes — N/A: no schema changes
- [x] No assumptions about lot ID stability — confirmed: dry-run is stateless, returns only counts

## Future Batch Readiness

- **E1 overall (Agent-Powered Sync)**: Ready. After B007, the full agent-powered sync workflow is complete: paste → parse → save → diff → dry-run → apply → reconcile → sign off. The remaining E1 item ("Automated email scheduling after sync") is a separate concern that doesn't depend on sync pipeline changes.
- **Next batches from other epics**: Solid. B007 adds no new tables, no new dependencies, and no architectural changes. The `dryRun` option on `SyncApplyResult` is a backward-compatible addition (existing callers now get `dryRun: false` in results). The `dry_run_sync` agent tool follows established patterns and won't conflict with any planned work.
- **Overall foundation**: Solid. The sync pipeline (`lib/sync-apply.ts`) is now feature-complete for E1 with a clean separation between dry-run (read-only early return) and real sync (full write path).

## Doc Updates Needed

- [ ] CLAUDE.md: Update test count from 115 to 125. After close, update B007 status in sprint context from `in-progress` to completed.
- [ ] Architecture.md: No changes needed — dry-run doesn't change the sync pipeline topology.
- [ ] LESSONS.md: No new lessons — the dry-run is a straightforward early-return pattern with no non-obvious decisions.
- [ ] epics.md: After B007 closes, update E1 status to reflect B007 done (all sync batches complete, only "Automated email scheduling" remains).
