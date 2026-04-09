# Integration Review — B011

**Reviewer:** Fresh agent session
**Date:** 2026-04-09
**Batch:** [docs/batches/B011-enquiry-flow-polish.md](../batches/B011-enquiry-flow-polish.md)

## Critical (must fix before merge)

No critical issues. The batch is small, fully sync-safe, and touches no schema, no lot IDs, no DB writes, and no agent tools. The only server-side change is a return-shape extension on a pre-existing in-memory rate limiter. All TypeScript checks pass, all 151 vitest tests pass, and the four changes are independent of one another.

## Important (should fix, can be next batch)

- **[app/api/enquiries/route.ts:17-46](../../app/api/enquiries/route.ts#L17-L46) — `checkEnquiryRateLimit()` lives in the route handler, not in `lib/`.** This was already true before B011, but B011 has now made the function meaningfully complex (it computes `retryAfter` from the oldest timestamp with edge cases at the boundary) without relocating it. The project pattern, established by [lib/document-requests.ts:189](../../lib/document-requests.ts#L189) (`getRecentRequestCount`), is that rate-limit functions live in `lib/` so they can be unit-tested. The two rate limiters are now conceptually parallel and used together in this same route, but only one is testable. **Why it matters for future batches:** the next time this logic is touched (e.g., the future "DB doc-request countdown" item from the retro, or the "Enquiry tracking — persist all enquiries to DB" Near-Term roadmap item), the changes will be unverifiable until the function is moved. Recommend co-locating in `lib/document-requests.ts` (since both rate limiters share a domain) or extracting to a new `lib/enquiry-rate-limit.ts`.

- **[app/api/enquiries/route.ts:171-188](../../app/api/enquiries/route.ts#L171-L188) — Two parallel 429 paths in the same route now return inconsistent JSON shapes.** The in-memory limiter (lines 171-178) returns `{ error, retryAfter }`. The DB doc-request limiter (lines 180-188) still returns `{ error }` only. The client at [app/contact/EnquiryForm.tsx:143](../../app/contact/EnquiryForm.tsx#L143) keys its friendly countdown off `typeof data.retryAfter === "number"`, so a user who trips the DB limiter sees the old generic "Failed to submit enquiry" path while a user who trips the in-memory limiter sees the new countdown. The two limiters are indistinguishable to the user. **Why it matters for future batches:** the Near-Term roadmap item "Enquiry tracking: persist all enquiries to DB" will likely consolidate or replace the in-memory limiter; the inconsistency will compound. The retro acknowledged this as "inconsistent UX between the two 429 paths" — the fix is `getOldestRequestTimestamp(email)` in [lib/document-requests.ts](../../lib/document-requests.ts) and threading it through.

- **[app/api/enquiries/route.ts:172-178](../../app/api/enquiries/route.ts#L172-L178) — 429 response is missing the standard HTTP `Retry-After` header.** The batch puts `retryAfter` in the JSON body only. The HTTP `Retry-After` header (in seconds) is the universal mechanism honored by curl, proxies, fetch interceptors, and HTTP client libraries. Other 429 responses in the codebase ([app/api/document-requests/route.ts:54](../../app/api/document-requests/route.ts#L54)) also omit it, so this is consistent with the existing (sparse) pattern — but B011 is the first 429 in the project that actually has the data to populate it. Future batches that touch retry handling (or any client built against this API outside the bundled `EnquiryForm`) will benefit if both the body and the header are populated. Trivial one-line fix: `NextResponse.json(..., { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } })`.

## Minor (nice to have)

- **[app/product/[id]/page.tsx:42](../../app/product/[id]/page.tsx#L42) — `pb-32 md:pb-8` clearance was added to the outer `max-w-5xl` container, but the sticky CTA at [line 118](../../app/product/[id]/page.tsx#L118) lives inside the inner white card (`overflow-hidden`, line 52).** Outer-container bottom padding adds empty space *after* the white card, not clearance *above* the sticky CTA inside it. In practice the sticky element resolves to the bottom of its `overflow-hidden` scroll-port, so the last lot row is naturally visible above it at max scroll — but the pb-32 is not doing what its name implies. The retro already flagged this and added a `LESSONS.md` entry ("When adding clearance for a sticky overlay, the padding belongs *inside* the same scroll container..."). For consistency with that lesson, the padding should be moved into the card content (e.g., the `<div className="p-6">` warehouse-listings wrapper at [line 93](../../app/product/[id]/page.tsx#L93)) or the sticky CTA should be hoisted out of the `overflow-hidden` parent. Not blocking, but the lesson is now codified while the code still violates it.

- **No unit test for `checkEnquiryRateLimit()`.** Once relocated to `lib/` (see Important #1), the function is a pure-ish helper that mirrors the test patterns in [tests/sync-validation.test.ts](../../tests/sync-validation.test.ts) and [tests/coa-data.test.ts](../../tests/coa-data.test.ts) — small fixtures, no DB. The boundary cases (`timestamps.length < max`, `timestamps.length >= max` with oldest at exactly `now - windowMs + 1ms`, and `retryAfter <= 0` clamping) are easy to get wrong on a future edit. The batch doc explicitly waived test coverage, so flagging as Minor only.

- **[app/contact/EnquiryForm.tsx:147](../../app/contact/EnquiryForm.tsx#L147) — "Try again in 1 minutes." (no pluralization).** Acknowledged in [B011-requirements.md](../batches/B011-requirements.md) as acceptable for an internal-grade tool. No existing pluralization helper in the codebase, so this is consistent with the absence of pattern. Flagging only because it's user-visible copy.

- **[agent_docs/document-requests.md](../../agent_docs/document-requests.md) and [agent_docs/public-pages.md](../../agent_docs/public-pages.md) — Neither doc mentions the new URL params (`name`, `company`, `email`) accepted by `/contact`.** Both currently mention only `productId` and `product`. The "Request Quote" link in [app/product/[id]/page.tsx:84](../../app/product/[id]/page.tsx#L84) and [app/product/[id]/page.tsx:120](../../app/product/[id]/page.tsx#L120) does NOT pass the buyer-info params (correct — they're for returning customers reached via external email links), but a future agent or batch reading these docs has no way to discover the new params without reading the source. One-line additions in each.

## Sync Survival Check
- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A, no new data persisted.
- [x] New tables/columns added to the "preserved during sync" path — N/A, no schema changes.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A, no schema changes.
- [x] No assumptions about lot ID stability — Confirmed; the only `lot.id` reference touched in this batch is in [app/product/[id]/page.tsx:39](../../app/product/[id]/page.tsx#L39) which is render-time only and resolves on every server-component render. No lot IDs stored, persisted, or cached.

This is one of the cleanest sync-safety profiles for a B-series batch — entirely client/UI + a single server return-shape extension, no DB layer touched at all.

## Future Batch Readiness

- **B012 — Product Detail Enhancements**: **Ready.** The only `app/product/[id]/page.tsx` changes in B011 are CSS classes on existing wrappers (lines 42 and 118). B012's "3 COAs available" badge and "Related products" sections will not collide with these. One soft hand-off: B012 should be aware of the `overflow-hidden` + sticky-CTA architectural smell flagged in the retro and the new LESSONS.md entry — if B012 adds new content sections at the bottom of the card, the sticky CTA's effective stop-point will move accordingly.

- **B013 — Admin UX Polish**: **Ready.** No surface overlap. B013 touches `/admin/requests` and `/qa`; B011 touches `/contact` and `/product/[id]`.

- **B014 — Product Comparison**: **Ready.** No surface overlap.

- **Near-Term: "Enquiry tracking — persist all enquiries to DB"**: **Concern.** This roadmap item will need to move `checkEnquiryRateLimit()` into `lib/` *anyway* (to share with whatever new `lib/enquiries.ts` it produces). Doing the move as part of B011's natural cleanup is cheaper than waiting. Otherwise the future batch will pay the relocation cost on top of its own scope.

- **Overall foundation**: **Solid.** The four B011 changes are independent and the only structural debt introduced (the rate-limit function staying in the route handler) is pre-existing — B011 didn't create it, only made it a more visible candidate for cleanup. No new patterns established here will need to be unwound later.

## Doc Updates Needed

- [x] **CLAUDE.md**: Already updated by the batch. Batch queue shows B011 `in-progress`, B010 moved to "Completed", "Last updated" date bumped to 2026-04-08. Test count "151" is correct (B011 added no tests). At close-batch time, B011 should move to the "Completed" list.
- [x] **Architecture.md**: No changes needed. The architecture is unchanged — no new routes, no new tables, no new client/server boundary, no new external integration. The existing description of the public enquiry surface ([Architecture.md:44](../../docs/Architecture.md#L44), [Architecture.md:165](../../docs/Architecture.md#L165)) still accurate.
- [x] **LESSONS.md**: Three new lessons added under "UI Components" — `viewport-fit=cover` requirement, `position: sticky` + `overflow: hidden` interaction, and `useState` initializer non-reactivity. All three are well-scoped, document non-obvious decisions, and reference exact file lines. Solid.
- [ ] **agent_docs/document-requests.md** ([line 15](../../agent_docs/document-requests.md#L15)): Should mention the additional URL params (`name`, `company`, `email`) accepted by `/contact` for returning-customer pre-fill. Currently only documents `productId` and `product`. One-line addition.
- [ ] **agent_docs/document-requests.md** ([line 21](../../agent_docs/document-requests.md#L21)): Could note that the in-memory limiter now returns a structured 429 with `retryAfter` while the DB limiter returns a generic 429 — informative for any future agent or batch debugging the enquiry flow.
- [ ] **agent_docs/public-pages.md** ([line 21](../../agent_docs/public-pages.md#L21)): Same as above — mention the new pre-fill URL params for completeness alongside the existing `productId`/`product` documentation.
- [x] **docs/epics.md**: Updated. E5 status flipped from `backlog` to `active`, B011 items struck through with batch reference. Accurate.
- [x] **docs/roadmap.md**: Updated. Five UX Polish items struck through with B011 batch reference. Accurate.