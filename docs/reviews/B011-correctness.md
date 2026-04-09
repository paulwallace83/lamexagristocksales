# Correctness Review — B011

**Reviewer:** Fresh agent session
**Date:** 2026-04-09
**Batch:** [docs/batches/B011-enquiry-flow-polish.md](../batches/B011-enquiry-flow-polish.md)

## Verification Run

- `npx tsc --noEmit` → exit 0 (clean)
- `npm test` → 6 files, 151 tests passed

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **[app/contact/EnquiryForm.tsx:51-58](../../app/contact/EnquiryForm.tsx#L51-L58)** — `form` state is initialized from `initialName / initialCompany / initialEmail` props using `useState({...})`. The initializer only runs on the component's first mount. If the user navigates between two `/contact?...` URLs that share the same route but with different `name` / `company` / `email` query parameters (e.g., from one product page to another via `Link`), Next.js App Router does **not** unmount `<ContactPageInner>` / `<EnquiryForm>` — it just re-renders them with new props. The form will keep showing the **first** set of pre-fill values, silently ignoring the new ones in the URL. Triggered by: any flow where a user opens `/contact` from product A (with name/company/email params), clicks "Back to Product", then opens `/contact` from product B without a full page reload. Fix: either add a `useEffect(() => setForm(f => ({...f, name: initialName || "", company: initialCompany || "", email: initialEmail || ""})), [initialName, initialCompany, initialEmail])` to sync prop changes (and accept that this would also wipe in-progress edits), or wrap `<EnquiryForm>` with a React `key` derived from the URL params so it remounts cleanly. The same pattern existed pre-B011 for `productName`, but `productName` is actually rendered directly from the prop when `productId` is set ([line 222](../../app/contact/EnquiryForm.tsx#L222)), so the staleness was masked. The new fields are **only** read from `form` state, so staleness is observable.

## Minor (nice to have)

- **[app/contact/EnquiryForm.tsx:144-149](../../app/contact/EnquiryForm.tsx#L144-L149)** — Pluralization edge cases in the rate-limit countdown message. When `seconds === 60` exactly, the minutes branch fires and renders "Try again in **1 minutes**." When `seconds === 1`, the seconds branch renders "Try again in **1 seconds**." Both are grammatically wrong. Fix: `${n} ${n === 1 ? "minute" : "minutes"}` (and similarly for seconds). Acceptance criterion #7 only specifies the format, not pluralization, so this is cosmetic — but it appears in user-facing error copy.

- **[app/api/enquiries/route.ts:40](../../app/api/enquiries/route.ts#L40)** — `Math.max(0, Math.ceil((oldest + windowMs - now) / 1000))` — the `Math.max(0, …)` clamp is unreachable. The block is only entered when `timestamps.length >= maxPerHour`, where `timestamps` has just been filtered to entries satisfying `now - t < windowMs`, i.e. `t > now - windowMs`, i.e. `oldest + windowMs - now > 0`. After `Math.ceil()` the value is always `>= 1`. Not a bug, but the clamp implies a defensive guard that isn't doing anything. Safe to leave.

- **[app/api/enquiries/route.ts:35-44](../../app/api/enquiries/route.ts#L35-L44)** — When `timestamps.length >= maxPerHour`, the function returns blocked but never writes the freshly-filtered `timestamps` array back into `enquiryTimestamps`. The unfiltered (potentially-stale) array stays in the map until either (a) the user successfully submits and the push branch persists a new filtered list, or (b) the 10-minute global cleanup tick runs. This means subsequent blocked requests re-do the same `.filter()` work on the unpruned list. Functionally correct (the local `timestamps` is what `Math.min` runs on), just a small inefficiency. Pre-existing pattern; not introduced by B011.

- **[app/contact/EnquiryForm.tsx:51-58](../../app/contact/EnquiryForm.tsx#L51-L58)** — Pre-filled values from URL params bypass the `<input maxLength={…}>` client-side cap. `maxLength` only constrains user typing, not programmatically-set values. A URL like `/contact?name=` followed by 250 characters will hydrate the Name input with a 250-char value. Server-side validation in `app/api/enquiries/route.ts` will reject it with the generic `"Name is required"` message, which is misleading for a length-violation. Low impact (deliberate URL crafting required), and the pre-existing API error copy is the bigger UX issue. Could optionally `.slice(0, MAX)` the props in `app/contact/page.tsx` before passing them down.

- **[app/product/[id]/page.tsx:42](../../app/product/[id]/page.tsx#L42) / [app/product/[id]/page.tsx:118](../../app/product/[id]/page.tsx#L118)** — The mobile bottom padding is `pb-32` (128 px). The sticky CTA on a notched device is approximately `pt-4` (16) + button (`py-3` + text ≈ 48) + `pb-[calc(1rem+env(safe-area-inset-bottom))]` (16 + up to 34) + 1 px border ≈ 115 px. 128 px is just barely sufficient on iPhone notch devices and leaves only ~13 px of clearance below the last lot row. Acceptance criterion #9 ("the last lot row is not obscured") will technically pass but with very little headroom. Consider `pb-36` or `pb-40` for a comfortable margin.

## Acceptance Criteria Check

| # | Criterion | Status |
|---|---|---|
| 1 | URL pre-fill of name/company/email | ✅ ([page.tsx:12-14](../../app/contact/page.tsx#L12-L14), [EnquiryForm.tsx:52-54](../../app/contact/EnquiryForm.tsx#L52-L54)) |
| 2 | URL params decoded correctly | ✅ `URLSearchParams.get()` decodes percent-encoding |
| 3 | Pre-filled fields editable | ✅ Standard controlled inputs |
| 4 | "Back to Product" + "Browse More" on success when productId present | ✅ ([EnquiryForm.tsx:194-209](../../app/contact/EnquiryForm.tsx#L194-L209)) |
| 5 | Only "Browse More Products" when productId absent | ✅ ([EnquiryForm.tsx:195](../../app/contact/EnquiryForm.tsx#L195) gates the Back link) |
| 6 | 429 body includes `retryAfter` (seconds) | ✅ ([route.ts:172-178](../../app/api/enquiries/route.ts#L172-L178)) |
| 7 | Client shows "Try again in X minutes/seconds" | ⚠️ Functional, but pluralization is off for the `n === 1` case (Minor #1) |
| 8 | `pb-[env(safe-area-inset-bottom)]` on sticky CTA | ✅ ([product/[id]/page.tsx:118](../../app/product/[id]/page.tsx#L118)) |
| 9 | Page content has bottom padding so last lot row isn't hidden | ⚠️ Met but tight on notched devices (Minor #5) |
| 10 | `npx tsc --noEmit` clean | ✅ Verified |

Note: AC #8 also relies on `viewportFit: "cover"` in the root viewport export so that `env(safe-area-inset-bottom)` resolves to the actual notch inset rather than `0`. This is correctly added in [app/layout.tsx:11-15](../../app/layout.tsx#L11-L15). Without it the safe-area padding would silently no-op.

## Out-of-Scope Observations (not B011 bugs, noted for the record)

- The API returns `"Name is required"` for both empty-string and over-length name inputs ([route.ts:73-78](../../app/api/enquiries/route.ts#L73-L78)). This pre-existing copy is misleading when the failure mode is length, not absence. Out of scope for this batch.
- The `form.product` field has the same "stale state on client navigation" pattern as the new fields, but it's masked because `productName` is read directly from the prop in the product-specific branch ([EnquiryForm.tsx:222](../../app/contact/EnquiryForm.tsx#L222)). Out of scope.