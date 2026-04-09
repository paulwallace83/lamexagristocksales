# Correctness Review — B010

**Reviewer:** Fresh agent session
**Date:** 2026-04-07
**Batch:** docs/batches/B010-coa-review-queue.md

**Build status:** `npx tsc --noEmit` clean, `npm test` passes (167 tests across 6 files; 42 in coa-data.test.ts including 16 new B010 tests)

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **[lib/agent-tools.ts:1290–1292 — `review_coa_data` `notFound` list]** — The `notFound` array reports lot numbers absent from the review queue, but the queue only contains pending/rejected rows. If a user asks the agent to approve lot `LOT-A` and that lot is already approved, it appears in `notFound` — misleading the user into thinking the lot doesn't exist. Triggered by: agent calling `review_coa_data` with specific `lotNumbers` where some are already approved. Fix: after computing `notFound`, look those lot numbers up in the full `coa_data` table and split the list into "already reviewed" vs "truly not found".

- **[lib/coa-data.ts:261–265 — `getCoaReviewQueue` missing empty-field guard]** — `getCoaDataForLots` skips entries where `Object.keys(fields).length === 0` (line 53–55), but `getCoaReviewQueue` only checks `typeof fields === "object" && fields !== null` — no empty check. If Claude Haiku extraction returned `{}` for a COA (e.g., unreadable scan), the lot would appear in the review queue with "No displayable fields" but approving it would have no visible effect on the public page (because `getCoaDataForLots` skips it anyway). Triggered by: extraction producing zero parsed fields. Fix: add `&& Object.keys(fields).length > 0` to the guard in `getCoaReviewQueue`, consistent with `getCoaDataForLots`.

## Minor (nice to have)

- **[app/api/coa-review/route.ts:41 — dead `testTypes` computation]** — The GET handler computes `detectCoaTestTypes(r.fields)` and includes `testTypes` in the response, but the `ReviewItem` interface in `QADashboardClient.tsx` doesn't consume it. Not a bug — just unused overhead per request.

- **[lib/agent-tools.ts:1286 — empty `lotNumbers` after filter treated as "review all"]** — If `input.lotNumbers` contains only invalid strings (e.g., `["", " "]`), filtering produces `[]`. Since `[].length > 0` is false, `targets` falls through to `queue` (all pending lots). Passing malformed lot numbers silently reviews ALL pending lots for the product. Triggered by: model sending invalid `lotNumbers`. Unlikely in practice since Claude constructs the params. Fix: check `lotNumbersRaw !== undefined && lotNumbersRaw.length === 0` and return early with a descriptive message.
