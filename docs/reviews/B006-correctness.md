# Correctness Review — B006

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B006-requirements.md

## Summary

B006 ("Agent Sync Write Tools — Apply & Reconcile") adds 2 agent tools (`apply_sync`, `get_reconciliation`) to complete the end-to-end sync workflow via the TDPAIB chat interface. Changes span `lib/agent-tools.ts` (2 tool definitions + 2 executeTool cases), `app/api/agent/chat/route.ts` (system prompt rule 14 steps h-j, capabilities line, action tool confirmation list), `agent_docs/agent-tdpaib.md` (tool count → 24, action tools list, capabilities), `tests/agent-sync-tools.test.ts` (6 new tests across 2 describe blocks), `CLAUDE.md` (B006 status → in-progress).

**TypeScript:** `npx tsc --noEmit` passes clean.
**Tests:** `npm test` — 112 tests across 6 files, 0 failures.

### Acceptance Criteria Verification

**Functional:** F1-F18 all met.
- `apply_sync` definition, execution, result shape, snapshot sanitisation, confirmation-required placement — all correct
- `get_reconciliation` definition, execution, result shape, read-only placement — all correct
- System prompt rule 14 extended with apply/reconcile/sign-off steps (h, i, j)
- `agent_docs/agent-tdpaib.md` updated: 24 tools (15 read-only, 9 action), capabilities include sync apply + reconciliation
- `apply_sync` correctly excludes internal-only fields (`cleanedUp`, `referenceFilesRegenerated`) from the returned result

**Error handling:** E1-E5 all met.
- Lock conflict returns specific message via exact string match
- Generic failures log server-side and return safe error strings
- `get_reconciliation` checks existence before calling `reconciliationReport()`

**Edge cases:** EC1-EC6 all covered.
- Missing files → `applySync()` throws → caught → generic "Sync failed"
- Empty `newArrivals` / non-empty `orphanedDocs` → included in result as-is

**Tests:** T1-T8 all met.
- 3 `apply_sync` tests (happy path, lock conflict, generic failure with path leak check)
- 3 `get_reconciliation` tests (happy path, missing inventory, throw with error leak check)
- `tsc --noEmit` clean, `npm test` green

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **lib/agent-tools.ts:958 (`apply_sync` snapshot path fallback)** — The fallback path `"data/snapshots/unknown"` is returned when `result.snapshotPath` does not contain the substring `"data/snapshots/"`. This is defensive but untestable in practice — `applySync()` always constructs the snapshot path via `join(dataDir, "snapshots", filename)`, so the substring will always be present. If a future refactor changes the snapshot directory name, the fallback would silently mask it rather than producing a visible error. Not a real bug today. Fix (if desired): log a warning when the fallback triggers.

- **tests/agent-sync-tools.test.ts (beforeEach change)** — Existing `get_new_arrivals` and `clear_new_arrivals` describes were changed from `vi.clearAllMocks()` to `vi.resetAllMocks()`. This is safe today (those tests set their own mock implementations per-test), but `resetAllMocks` strips the default `fs` mock implementations, meaning any future test added to those describes that relies on the `readFileSync` delegation to the real implementation would silently get `undefined` instead. Not a current bug — just a note for future test authors.
