# Integration Review — B008

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** docs/batches/B008-post-sync-email-suggestion.md

## Critical (must fix before merge)

No critical integration issues found.

## Important (should fix, can be next batch)

- **`lib/agent-tools.ts` (line 614-631) vs `lib/agent-db.ts` / `lib/product-flags.ts`** — The `get_new_arrivals` handler contains an inline SQL JOIN query (`product_flags JOIN products`) directly in `agent-tools.ts`. The established pattern for read-only tools is to delegate DB queries to dedicated modules: most read-only tools call functions in `lib/agent-db.ts` (e.g. `getProductSummaries()`, `findLotsByNumber()`, `searchProducts()`, `getSyncInfo()`), `lib/documents.ts` (`getDocumentStatus()`), or `lib/discount.ts` (`getDiscountItems()`). Only `save_coa_data` does an inline DB query, and that is an action tool with validation logic that justifies the inline approach. The batch doc itself specified importing `getFlags` from `lib/product-flags.ts`, but `getFlags("new_arrival")` does not return product names (only `productId`, `flag`, `setAt`, `setBy`), so the deviation is functionally justified. However, the canonical fix would be to either (a) add a `getNewArrivalsWithNames()` function to `lib/product-flags.ts` or `lib/agent-db.ts` and call it from the tool handler, or (b) use `getFlags("new_arrival")` and then look up product names in a second query. This keeps `agent-tools.ts` as a thin orchestration layer, consistent with how every other read-only tool works. Impact on future: as more agent tools are added (B004-B007 in the E1 epic), having queries scattered inline in `agent-tools.ts` makes testing harder and increases the surface area of that already-large file (929 lines).

- **`package.json`** — The diff includes changing `"dev": "next dev"` to `"dev": "next dev -p 3001"`. This is not listed in the B008 scope (batch doc specifies only `lib/agent-tools.ts`, `app/api/agent/chat/route.ts`, and `tests/agent-sync-tools.test.ts`). While the change aligns `package.json` with what CLAUDE.md already documents (port 3001), including unrelated changes in a batch violates requirement R21: "No unrelated changes introduced." This should either be committed separately or explicitly acknowledged as out-of-scope housekeeping.

## Minor (nice to have)

- **`lib/agent-tools.ts` (line 614-631)** — The `get_new_arrivals` case is placed between `get_coa_backfill_status` and the `/* -- Batch read-only tools */` comment section. This is correct placement (it's in the "Read-only tools" section), and is consistent. However, the `clear_new_arrivals` case (line 837-840) is placed between `backfill_coa_data` and `create_discount_item` in the "Action tools" section. The action tool section has no explicit comment header the way "Read-only tools" and "Batch read-only tools" do. This is consistent with how other action tools are placed (they just follow sequentially), so no change needed, but a future refactor could add sub-headers for clarity as the tool count grows.

- **`tests/agent-sync-tools.test.ts`** — The test file mocks `../lib/product-flags` with only `clearFlags`, which is the only function currently imported in `agent-tools.ts`. If the Important finding above is addressed (extracting the query to `product-flags.ts`), the mock would need to be updated. The current test structure is otherwise consistent with patterns in `tests/coa-data.test.ts` and `tests/documents.test.ts`: top-level `vi.mock("../lib/db")`, `describe/it` blocks, `beforeEach(() => vi.clearAllMocks())`, and `vi.mocked()` for return value setup.

- **`app/api/agent/chat/route.ts` (line 48)** — The new rule 13 mentions `apply_sync` which is a tool from B006 (not yet merged to main). The system prompt reference is forward-looking since B008's dependency on B006 was dropped (B008 was scoped as independently implementable). The system prompt instruction "After a successful apply_sync that includes new arrivals..." is harmless today (the agent simply won't encounter that scenario until B006 lands), but it could confuse the model slightly if a user asks about sync and the model references a tool that doesn't exist. This is very minor since the rule starts with "or when the user asks about new arrivals" which is the primary trigger path without B006.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A: no new data stored. `get_new_arrivals` reads from `product_flags` (preserved across sync) joined with `products` (rebuilt during sync). The join uses `product_id` which is stable (slugified, deterministic). `clear_new_arrivals` deletes from `product_flags` by flag type.
- [x] New tables/columns added to the "preserved during sync" path (if applicable) — N/A: no new tables or columns. `product_flags` is already in the preserved list per `docs/Architecture.md` line 97.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A: no schema changes.
- [x] No assumptions about lot ID stability — Confirmed. Neither tool references lot IDs. The `get_new_arrivals` query joins `product_flags.product_id` to `products.id`, both of which are stable across syncs.

## Future Batch Readiness

- **B004 (Agent-Powered Sync — extract lib)**: Ready. B008 does not modify `lib/sync.ts` or introduce any conflicting patterns. The inline query pattern in `get_new_arrivals` is a minor concern: if B004 adds more read-only tools, the pattern of inlining queries in `agent-tools.ts` may proliferate.
- **B005 (Agent-Powered Sync — read tools)**: Ready. Same as B004.
- **B006 (Agent-Powered Sync — write tools)**: Ready. B006 adds `apply_sync` which B008's system prompt rule 13 already references. The `get_new_arrivals` tool is ready to be called after `apply_sync` completes. No merge conflicts expected.
- **B007 (Sync dry-run)**: Ready. No overlap.
- **Overall foundation**: Solid. The two new tools are small, well-tested, and follow the established tool definition + execution pattern. The system prompt update is well-scoped. The only structural concern is the inline query in `get_new_arrivals` vs the established delegation pattern, which is a minor consistency issue that doesn't block any future batch.

## Doc Updates Needed

- [ ] CLAUDE.md: No changes needed. The "In Progress" section already references B008. The `npm run dev` port documentation (line 19) was already correct before the `package.json` change; they are now in sync.
- [ ] Architecture.md: No changes needed. The TDPAIB tool list is described generically ("Tools defined in `lib/agent-tools.ts`"), not enumerated individually. No new architectural patterns introduced.
- [ ] LESSONS.md: No new lessons. The deviation from the batch doc (using inline SQL instead of `getFlags`) is a pragmatic choice to get product names in a single query, but it doesn't rise to the level of a hard-won lesson. If the pattern of inline queries in `agent-tools.ts` causes problems in future batches, that would warrant a lesson entry.
