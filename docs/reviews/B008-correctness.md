# Correctness Review — B008

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** `docs/batches/B008-post-sync-email-suggestion.md`

## Automated Checks

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Clean (no errors) |
| `npm test` | 82 passed, 0 failed |

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **`package.json` line 7** — `"dev": "next dev -p 3001"` is an unrelated change (adds explicit port flag). The Definition of Done states "No unrelated changes introduced." This should either be committed separately on `main` or acknowledged as an intentional scope addition. Not a bug, but violates the batch's own DoD criterion.

## Minor (nice to have)

- **`lib/agent-tools.ts:837-840` (`clear_new_arrivals` case)** — No local try/catch around the `clearFlags()` call. If the DB is locked or throws, the raw error propagates to the outer catch in `route.ts`, which sends a generic `err.message` to the client. Other action tools (e.g., `create_discount_item` at line 856) wrap in try/catch for friendlier messages. However, `restore_discount_item` (line 870) also lacks a local catch, so this is consistent with existing patterns. Low risk — `clearFlags` is a simple DELETE and SQLite locking is transient.

## Acceptance Criteria Verification

| AC | Status | Notes |
|----|--------|-------|
| 1. `get_new_arrivals` returns `{ arrivals: [{productId, productName, flaggedAt}], count }` | **Pass** | `agent-tools.ts:614-631` — INNER JOIN on `products` provides names; maps `product_id → productId`, `product → productName`, `set_at → flaggedAt` |
| 2. Returns `{ arrivals: [], count: 0 }` when empty | **Pass** | `.all()` returns `[]`; `rows.length` → 0. Confirmed by test at `agent-sync-tools.test.ts:70-78` |
| 3. `clear_new_arrivals` returns `{ success: true, cleared: <count> }` | **Pass** | Delegates to `clearFlags("new_arrival")` which returns `result.changes`. Confirmed by test at line 88-94 |
| 4. `clear_new_arrivals` requires confirmation | **Pass** | Added to confirmation-required list in system prompt rule 1 (`route.ts:28`). Rule 13 instructs agent to confirm before clearing |
| 5. `clear_new_arrivals` returns `cleared: 0` as no-op | **Pass** | `clearFlags` returns `result.changes` which is 0 when no rows match. Confirmed by test at line 97-103 |
| 6. System prompt guides post-sync email suggestion | **Pass** | Rule 13 at `route.ts:48` — instructs agent to call `get_new_arrivals`, present list, suggest email link, offer clear option |
| 7. `npx tsc --noEmit` clean | **Pass** | Verified |

## Additional Observations

- **INNER JOIN is correct by design:** `product_flags` has no FK constraint on `product_id`, so orphan flags (from products removed during sync) are silently excluded by the JOIN. This matches the batch doc's Notes: "If a flagged product no longer exists, it's excluded from the result."
- **`getFlags` not imported:** The batch doc suggested importing `getFlags`, but the implementation queries the DB directly with a JOIN to get product names in one query — a better approach that avoids a second lookup.
- **Test coverage is solid:** 4 test cases cover both tools in happy-path and empty-state scenarios, with proper mock isolation of `getDb` and `clearFlags`.
