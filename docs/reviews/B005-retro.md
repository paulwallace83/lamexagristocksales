# Retrospective — B005

## Summary

Clean batch. Three new agent tools added to existing infrastructure with no new tables, no new routes, no client-side changes. All tools follow established patterns from prior batches. The `fs` mock in the test file is the most fragile part — it works but introduces a latent risk for future test additions. One minor documentation gap in `agent_docs/agent-tdpaib.md` (capabilities list not updated with sync workflow).

## Acceptance Criteria Status

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `get_reference_data` returns `{ suppliers, warehouses }` | PASS | Returns parsed arrays from both JSON files |
| 2 | `save_proposed_inventory` validates non-empty array, returns `{ success, productCount, path }` | PASS | |
| 3 | `save_proposed_inventory` rejects missing/non-array products | PASS | Handles missing, null, string, empty array |
| 4 | `save_proposed_inventory` in confirmation-required list | PASS | Added to rule 1 in system prompt |
| 5 | `run_sync_diff` returns `{ report, warnings, summary }` | PASS | Calls `computeDiff()` then `formatDiffReport()` |
| 6 | `run_sync_diff` returns error if either file missing | PASS | Separate checks for proposed and inventory |
| 7 | System prompt includes sync workflow rule | PASS | Rule 14 added with 8-step workflow |
| 8 | `npx tsc --noEmit` clean | PASS | |

## File-by-File Review

### lib/agent-tools.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - `get_reference_data` error message (line 650) passes through `err.message` which may contain internal file paths (e.g., `ENOENT: no such file or directory, open '/Users/.../data/suppliers.json'`). This goes to the agent chat, which is behind auth. Consistent with existing pattern in `get_import_review` (line 632), but worth noting.
  - `run_sync_diff` does not check for `suppliers.json` or `warehouses.json` existence before calling `computeDiff()`. If either is missing, `computeDiff`'s `safeReadJson` throws, which is caught by the try/catch at line 672. This works correctly but the error message from `safeReadJson` includes the full path — again, auth-only surface.
  - `save_proposed_inventory` writes to a fixed path `data/inventory-proposed.json` under `process.cwd()`. On Railway, `process.cwd()` is the app directory (not the volume). This is correct — `inventory-proposed.json` is a working file under `data/`, not on the persistent volume. Matches the `get_import_review` pattern.
- **Suggested Refactoring:** None — the code is minimal and follows existing file patterns (`get_import_review` for file reads, `clear_new_arrivals` for simple tools).
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - `save_proposed_inventory` does not cap the size of the products array. A malicious or accidental call with millions of objects could write a very large file. Low risk — the tool is behind auth, requires confirmation, and the Anthropic API enforces token limits on tool inputs.
  - `run_sync_diff` does not check `suppliers.json`/`warehouses.json` existence separately — relies on `computeDiff` to throw. The error message is less user-friendly ("Cannot read suppliers...") vs. the clear "No inventory-proposed.json found" message. Acceptable for internal tooling.
- **Sync survival:** No lot IDs used. `get_reference_data` reads static files. `save_proposed_inventory` writes a working file that gets deleted after sync. `run_sync_diff` is read-only. All safe.
- **Data privacy:** `get_reference_data` returns supplier and warehouse data — no customer names or pricing. `save_proposed_inventory` writes whatever the agent sends — the system prompt (rule 14b) instructs the agent to strip customer names from Row 3. `run_sync_diff` returns the diff report which contains product names, weights, and supplier names — no customer data. Safe.
- **Client/server boundary:** All code runs server-side within `executeTool`. The `computeDiff` and `formatDiffReport` imports are from `./sync` which uses `readFileSync` — server-only. No client component touches these.
- **Path safety:** All paths constructed from `process.cwd()` + hardcoded subdirectories. No user-derived path segments. `save_proposed_inventory` writes to a fixed path — no traversal risk.

### app/api/agent/chat/route.ts
- **Confidence:** 9/10
- **Uncertainties:** Rule 14h says "tell the user the proposed inventory is ready to apply" — the `apply_sync` tool doesn't exist yet (B006). The rule is dormant but correctly phrased. Same pattern as rule 13's forward-reference to `apply_sync`, noted in B008 retro.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** The pivot parsing instructions in rule 14b are detailed but ultimately rely on the LLM's ability to parse raw pasted text. If the pivot format changes, the system prompt may need updating. This is inherent to prompt-based instructions — not a code issue.
- **Sync survival:** N/A (system prompt only).
- **Data privacy:** Rule 14b explicitly says "ALWAYS STRIP — never include in output" for customer names. Consistent with CLAUDE.md critical rule #1. The rest of the workflow only surfaces product names, weights, and supplier data.
- **Client/server boundary:** N/A (prompt string only).
- **Path safety:** N/A.

### tests/agent-sync-tools.test.ts
- **Confidence:** 8/10
- **Uncertainties:**
  - The global `vi.mock("fs")` replaces `readFileSync`, `writeFileSync`, and `existsSync` for the entire test file. The existing B008 tests (`get_new_arrivals`, `clear_new_arrivals`) don't call any `fs` functions, so there's no interference today. But if someone adds a test for a tool that uses `readFileSync` (e.g., `get_import_review`) to this file, the mock could cause unexpected behavior.
  - `vi.clearAllMocks()` in `beforeEach` clears call history but does NOT reset `mockImplementation`. A `readFileSync.mockImplementation(...)` set in one `it()` block persists into subsequent tests in the same describe. In practice, every test that needs a specific `readFileSync` behavior sets its own `mockImplementation`, so there's no cross-test contamination today. But it's a latent risk.
  - The `run_sync_diff` happy path test mocks `existsSync` to return `true` for ALL paths. This means it doesn't exercise the case where `suppliers.json` or `warehouses.json` is missing (that scenario is handled by the try/catch in the implementation, but untested).
- **Suggested Refactoring:** Consider using `beforeEach(() => vi.resetAllMocks())` instead of `vi.clearAllMocks()` to ensure mock implementations are also reset between tests. This would require each test to explicitly set any mock it needs — more verbose but safer.
- **Shortcuts Taken:** No test for `writeFileSync` throwing (disk full / permissions error) in `save_proposed_inventory`. The implementation handles it (try/catch at line 733), but the test doesn't exercise that path.
- **Unhandled Edge Cases:** No test for `computeDiff` throwing (e.g., malformed JSON in inventory files). The try/catch covers it, but it's untested.
- **Sync survival:** N/A (test only).
- **Data privacy:** N/A (test only).
- **Client/server boundary:** N/A (test only).
- **Path safety:** N/A (test only).

### agent_docs/agent-tdpaib.md
- **Confidence:** 9/10
- **Uncertainties:** None.
- **Suggested Refactoring:** The capabilities list at the top doesn't include a "Weekly sync workflow" bullet — only the tool count and action tools list were updated. Should add a capability entry for consistency.
- **Shortcuts Taken:** Only updated Architecture section; skipped adding a capabilities bullet.
- **Unhandled Edge Cases:** N/A (documentation).

### docs/batches/B005-requirements.md
- **Confidence:** 10/10
- **Uncertainties:** None — documentation file.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** N/A.

### CLAUDE.md (batch queue status change)
- **Confidence:** 10/10 — status change from `ready` to `in-progress` and "In Progress" section updated.

## Cross-Cutting Concerns

- **Error handling:** All 3 tools return structured `{ error: "..." }` on failure — never throw. Error messages include context from the original exception. These errors go through the SSE stream to the authenticated admin user, then the agent reports them (system prompt rule 9). Error messages may include internal file paths from `readFileSync` / `safeReadJson` failures — acceptable for internal admin tooling, consistent with existing patterns.
- **Loading & empty states:** N/A — no UI changes in this batch.
- **Auth & roles:** No new routes added. The 3 tools execute within the existing `/api/agent/chat` route which requires `qa` or `reviewer` role. No auth bypass possible.
- **Audit logging:** No auditable actions added. `save_proposed_inventory` writes a working file, not persistent data — no audit trail needed. Usage is already tracked by the existing `api_usage` recording in the route handler.
- **Validation:** `save_proposed_inventory` validates the `products` input (must be non-empty array). No Zod validation — follows existing pattern where agent tool inputs are validated with simple type checks. All other agent tools use the same pattern.
- **TypeScript:** No `any` types added. `computeDiff` and `formatDiffReport` return fully typed `SyncDiff` and `string`. `input.products` is `unknown` (from the `Record<string, unknown>` signature) — validated with `Array.isArray()` before use.

## Items Needing Immediate Attention

None — all files rated 8 or above, all acceptance criteria PASS.

## Items for Future Batches

1. **`agent_docs/agent-tdpaib.md` capabilities list** — add a "Weekly sync workflow" bullet to the Capabilities section for consistency with the tool count update. Low priority.
2. **Test coverage gap: `writeFileSync` failure path** — `save_proposed_inventory` handles disk errors (try/catch), but no test exercises this. Add a test that mocks `writeFileSync` to throw and verifies the error response.
3. **Test coverage gap: `computeDiff` failure path** — `run_sync_diff` handles `computeDiff` throwing, but no test exercises this path.
4. **Test coverage gap: missing reference data files** — `run_sync_diff` checks for `inventory.json` and `inventory-proposed.json` but not `suppliers.json`/`warehouses.json`. The catch handles it, but no test verifies the error message quality.

## Lessons Learned

None — this batch was a clean application of existing patterns with no surprises. The implementation closely mirrors B008's approach (new tools + system prompt rule + tests in the same file).
