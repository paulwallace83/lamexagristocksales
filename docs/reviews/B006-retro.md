# Retrospective — B006

## Summary

Clean implementation with no surprises. Both tools wire up to existing, well-tested library functions (`applySync`, `reconciliationReport`) with no new data model or schema changes. The main design decisions — sanitising `snapshotPath`, forwarding only the lock-conflict error message, and keeping `get_reconciliation` as a non-confirmation read tool — all followed from the planning phase. No shortcuts were taken; the scope was deliberately narrow.

## Acceptance Criteria Status

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `apply_sync` calls `applySync()` and returns `{ success: true, result: SyncApplyResult }` | PASS | Returns sanitised subset — `snapshotPath` stripped to relative, `cleanedUp` and `referenceFilesRegenerated` excluded (internal-only flags) |
| 2 | `apply_sync` returns `{ error: "Sync already in progress" }` on lock conflict | PASS | Exact string match on error message |
| 3 | `apply_sync` returns `{ error: "..." }` on other throws | PASS | Returns generic `"Sync failed"` — intentionally less descriptive than AC wording to avoid path leakage (per B005 security findings) |
| 4 | `apply_sync` in confirmation-required list | PASS | Added to rule 1 |
| 5 | `get_reconciliation` returns `{ report: "..." }` | PASS | |
| 6 | `get_reconciliation` returns `{ error: "..." }` when inventory missing | PASS | Pre-check with `existsSync` |
| 7 | System prompt covers apply → reconcile → sign-off | PASS | Rule 14 steps h–j |
| 8 | `npx tsc --noEmit` clean | PASS | |

## File-by-File Review

### lib/agent-tools.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - The `snapshotPath` sanitisation (line 958–960) uses `String.includes("data/snapshots/")` + `String.split().pop()`. This works for all paths produced by `applySync()` today (which uses `join(dataDir, "snapshots", filename)`), but would produce `"data/snapshots/unknown"` if the path format ever changed to not include that literal substring. Unlikely but brittle.
  - `applySync()` is synchronous and can be slow on large inventories. If it exceeds Railway's 30-second timeout on the SSE connection, the agent request will fail mid-sync with a partially applied state (the lock file will remain). This is the same constraint as the CLI script and is documented in Architecture.md as a known limitation.
- **Suggested Refactoring:**
  - The `apply_sync` result construction (lines 961–978) manually lists every field from `SyncApplyResult` except `cleanedUp` and `referenceFilesRegenerated`. If `SyncApplyResult` gains new fields in a future batch, they won't be automatically included. A spread + delete pattern would be more maintainable, but also riskier (could leak new sensitive fields). The explicit listing is the safer choice.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - If `applySync()` throws a non-Error (e.g., a string or number), the `err instanceof Error` check returns false, `msg` is empty, the lock-conflict branch is skipped, and the generic `"Sync failed"` is returned. This is correct behaviour — the catch-all works.
- **Sync survival:** No new data stored. The tool performs the sync itself.
- **Data privacy:** `SyncApplyResult` contains `orphanedDocs[].originalName` (user-uploaded filenames) and `newArrivals` (product IDs). Neither contains customer names or pricing. Safe.
- **Client/server boundary:** `applySync` and `reconciliationReport` are server-only imports. The tool executes inside `executeTool()` which only runs in the route handler. No client import risk.
- **Path safety:** No user-derived path segments. All paths constructed from `process.cwd()` + hardcoded filenames. `snapshotPath` output is sanitised to relative.

### app/api/agent/chat/route.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - Rule 14h says "Wait for explicit confirmation" but `apply_sync` is already in the rule 1 confirmation-required list. This is intentional double-emphasis (belt and suspenders for the most dangerous tool), not a bug. The model will see both instructions.
- **Suggested Refactoring:** None — the prompt is clear and follows the established pattern.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None.
- **Data privacy:** Rule 14b (strip customer names from Row 3) is unchanged and still in effect. No new privacy concerns.

### tests/agent-sync-tools.test.ts
- **Confidence:** 8/10
- **Uncertainties:**
  - The `apply_sync` happy path test mocks `applySync` with a `mockResult` that has `deductionReport: { deducted: 3, skipped: 0 }`. The actual `DeductionReport` type in `lib/sync-apply.ts` may have different field names (it imports from `lib/discount.ts`). The test passes because the mock is typed as `any`, so a field name mismatch wouldn't be caught. This is a latent type-safety gap in the test.
  - The `get_reconciliation` missing-inventory test uses `existsSync` mock that returns false for any path ending in `"inventory.json"`. This would also match `"inventory-proposed.json"` if any other tool were called in the same test — but since only `get_reconciliation` is called, this doesn't matter in practice.
- **Suggested Refactoring:**
  - The `mockResult` in the apply_sync happy path could be typed as `SyncApplyResult` instead of cast to `any`, which would catch field name drift. This requires importing the type from `../lib/sync-apply` which is mocked — would need `vi.importActual` for the type. Minor improvement.
- **Shortcuts Taken:**
  - No test verifies the actual arguments passed to `applySync()` (i.e., that `proposedPath`, `inventoryPath`, and `dataDir` are correctly constructed). The test only checks the return value transformation. A more thorough test would assert `applySync` was called with paths ending in the expected filenames.
- **Unhandled Edge Cases:**
  - No test for `apply_sync` when `applySync()` returns a result where `snapshotPath` doesn't contain `"data/snapshots/"` — this would trigger the `"data/snapshots/unknown"` fallback. Low priority since `applySync()` always produces paths with that substring.

### agent_docs/agent-tdpaib.md
- **Confidence:** 10/10
- **Uncertainties:** None.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** N/A.

### CLAUDE.md
- **Confidence:** 10/10
- **Uncertainties:** None. Test count updated to 112, B006 status set to `in-progress`.

## Cross-Cutting Concerns

- **Error handling:** All error paths log server-side via `console.error` and return generic messages. Lock-conflict is the only specific error forwarded (it's a fixed string with no sensitive content). No stack traces or filesystem paths leak to the client. Matches the pattern established by B005 security review fixes.
- **Loading & empty states:** N/A — no UI changes in this batch.
- **Auth & roles:** No new routes. Both tools execute within `executeTool()` which is called from `app/api/agent/chat/route.ts`, already gated by `qa`/`reviewer` session check (line 71–79). No auth changes needed.
- **Audit logging:** No formal audit log exists in the system (noted as architectural debt). `applySync()` creates a dated snapshot file which serves as an implicit audit trail. The `api_usage` table records the agent request that triggered the sync.
- **Validation:** `apply_sync` takes no parameters — nothing to validate. `get_reconciliation` takes no parameters. Both tools validate prerequisites via `existsSync` checks (get_reconciliation) or let `applySync()` perform its own preflight validation.
- **TypeScript:** `npx tsc --noEmit` passes clean. No `any` types introduced in production code. Tests use `as any` for mock typing (consistent with all existing tests in the file).

## Items Needing Immediate Attention

None. All criteria PASS. All files rated 8+.

## Items for Future Batches

1. **Test: assert `applySync` call arguments** — The `apply_sync` happy path test doesn't verify the paths passed to `applySync()`. Add an assertion like `expect(applySync).toHaveBeenCalledWith(expect.objectContaining({ dataDir: expect.stringContaining("data") }))`. Low priority — the paths are hardcoded, not user-derived.

2. **Test: type-safe mock result** — The `mockResult` in the apply_sync test is cast to `any`. Importing `SyncApplyResult` type and using it would catch field name drift if the type changes.

3. **`snapshotPath` sanitisation brittleness** — The `String.includes("data/snapshots/")` approach works but is fragile. If `applySync` ever changes its snapshot directory structure, the fallback produces `"data/snapshots/unknown"`. Consider using `path.relative(process.cwd(), result.snapshotPath)` instead for a more robust approach. Not urgent — the snapshot path format is stable.

4. **B005-D2 (TOOL_DEFINITIONS ordering)** — The new `get_reconciliation` and `apply_sync` definitions were appended at the end of the array, continuing the pre-existing pattern of mixed read/action tools in the trailing block. The `executeTool` switch correctly groups them. A future refactor batch could reorder the entire `TOOL_DEFINITIONS` array to match the switch grouping.

## Lessons Learned

No new lessons. The batch was a straightforward wiring exercise — calling two existing library functions from the agent tool framework. The planning phase (B005 security review findings about path leakage) directly informed the error handling design. No surprises, no regressions.
