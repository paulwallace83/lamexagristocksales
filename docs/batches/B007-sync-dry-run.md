# B007 — Sync Dry-Run Mode

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Depends On
- B004 (must be merged first) — `applySync()` library function

---

## Goal

Add a `--dry-run` flag to the sync pipeline that validates the entire sync would succeed without mutating any data. Gives Paul confidence that a sync will complete cleanly before committing — especially useful when running via the agent where rollback is less convenient than in the terminal.

---

## Background

Currently, the only way to know if a sync will succeed is to run it. If it fails partway through (e.g., invalid JSON, DB constraint violation), the snapshot exists but the system may be in a partial state. A dry-run mode runs every step except the actual writes: parse JSON, validate structure, simulate the DB transaction (open + rollback), and report what would happen — all without touching `inventory.json`, the snapshot directory, or the database.

B004 extracted `applySync()` into `lib/sync-apply.ts`. This batch adds a `dryRun: boolean` option to that function and a `--dry-run` flag to the CLI script.

---

## Scope

### In scope
- Add `dryRun?: boolean` option to `SyncApplyOptions` in `lib/sync-apply.ts`
- When `dryRun` is true: preflight validation runs, diff is computed, but no snapshot is created, `inventory.json` is not overwritten, DB is not re-seeded, no files are modified
- Dry-run returns the same `SyncApplyResult` shape with a `dryRun: true` flag, containing the counts and reports that *would* result from a real sync
- `scripts/sync-inventory.ts` accepts `--dry-run` flag: `npm run sync -- --dry-run`
- New agent tool `dry_run_sync` that calls `applySync({ dryRun: true })`
- System prompt update: agent should suggest dry-run before apply when the user seems uncertain

### Out of scope
- Rollback capability (the snapshot already serves this purpose)
- Diff report (already handled by `run_sync_diff` in B005)
- Any UI for dry-run outside the agent

---

## Acceptance Criteria

1. `applySync({ ..., dryRun: true })` returns a `SyncApplyResult` with `dryRun: true` and all count fields populated (productCount, listingCount, etc.).
2. After a dry-run, `inventory.json` is unchanged (byte-identical to before the call).
3. After a dry-run, no snapshot file is created in `data/snapshots/`.
4. After a dry-run, the SQLite database is unchanged (no rows inserted, deleted, or modified).
5. Dry-run still acquires and releases the sync lock (prevents concurrent dry-run + real sync).
6. `npm run sync -- --dry-run` prints a prefixed `[DRY RUN]` summary and exits 0.
7. `dry_run_sync` agent tool returns `{ dryRun: true, result: SyncApplyResult }`.
8. `dry_run_sync` does NOT require user confirmation (it's read-only).
9. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/sync-apply.ts` | Add `dryRun?: boolean` to `SyncApplyOptions`. Add `dryRun: boolean` to `SyncApplyResult`. When true: run preflight + compute counts from proposed JSON without writing anything. |
| `scripts/sync-inventory.ts` | Parse `--dry-run` from `process.argv`. Pass to `applySync()`. Format output with `[DRY RUN]` prefix. |
| `lib/agent-tools.ts` | Add `dry_run_sync` tool definition and execution case. |
| `tests/sync-apply.test.ts` | Extend with dry-run test cases. |

**Do not modify:**
- `lib/sync.ts` — diff engine unchanged
- `app/api/agent/chat/route.ts` — system prompt gets a minor addition only (suggest dry-run when uncertain)

---

## Test Plan

Extend `tests/sync-apply.test.ts`:

- **Dry-run does not write files:** Mock `fs.writeFileSync`, `fs.copyFileSync`. Call `applySync({ dryRun: true, ... })`. Verify neither mock was called.
- **Dry-run returns counts:** Provide a mock proposed inventory with 3 products, 5 listings. Verify `result.productCount === 3`, `result.listingCount === 5`, `result.dryRun === true`.
- **Dry-run does not touch DB:** Mock `getDb()`. Call with `dryRun: true`. Verify no `prepare().run()` calls were made.
- **Dry-run acquires lock:** Verify lock file is created at entry and removed in finally block.

Bootstrap:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
```

---

## Notes

- The dry-run counts (productCount, listingCount, etc.) come from parsing `inventory-proposed.json` and counting the entries — no DB interaction needed.
- Dry-run is especially valuable for the agent workflow because the agent can automatically call it after `save_proposed_inventory` and `run_sync_diff`, giving the user a confidence check before the irreversible `apply_sync`.
- The lock is still acquired during dry-run to prevent a real sync from starting while a dry-run is reading the proposed file. This is a brief hold (milliseconds for JSON parsing).

---

## Definition of Done

- [ ] `applySync({ dryRun: true })` returns result without mutating anything
- [ ] `npm run sync -- --dry-run` prints summary with `[DRY RUN]` prefix
- [ ] `dry_run_sync` agent tool works and is read-only (no confirmation required)
- [ ] Lock acquired and released during dry-run
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
