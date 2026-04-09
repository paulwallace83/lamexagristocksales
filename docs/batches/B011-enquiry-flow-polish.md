# B011 — Enquiry Flow Polish

**Epic:** E5 — Buyer Experience: Self-Service Improvements
**Status:** `ready`
**Estimated size:** Small (< 1 hr)

---

## Goal

Reduce friction in the buyer enquiry flow with four small, independent improvements: pre-fill the form for returning customers via URL params, add navigation links after submission, show a meaningful cooldown timer instead of a generic rate-limit error, and fix mobile sticky CTA padding to prevent content overlap on iOS.

---

## Background

The enquiry form (`app/contact/EnquiryForm.tsx`) currently accepts `productId` and `product` as URL params (via `app/contact/page.tsx` line 10–11), but not buyer contact details. Returning customers must re-enter their name, company, and email every time.

After submission, the form shows a static success message (line 150–180) with no navigation — the buyer is stranded on the contact page.

Rate limiting (`app/api/enquiries/route.ts` line 17–38) uses an in-memory timestamp map (5 per email per hour). On rejection, the API returns a generic `"Too many requests. Please try again later."` (line 165) with no indication of when the cooldown expires.

The mobile sticky CTA (`app/product/[id]/page.tsx` line 117–125) uses `sticky bottom-0` but has no `safe-area-inset-bottom` for notch devices, and the last content in the page can be hidden behind it.

---

## Scope

### In scope
- Accept `name`, `company`, `email` as additional URL params on `/contact` and pre-fill the form
- Add "Back to Product" and "Browse More Products" links on the enquiry success state
- Return `retryAfter` (seconds) in the 429 response body; display a countdown timer on the client
- Add `pb-safe` / `safe-area-inset-bottom` padding to the mobile sticky CTA and content padding to prevent overlap

### Out of scope
- Persisting buyer contact details across sessions (localStorage) — that's the "Saved search / watchlist" item
- Changes to the rate limit window or threshold (5 per hour stays)
- Changes to the enquiry API validation logic
- Any new API routes

---

## Acceptance Criteria

1. Navigating to `/contact?productId=X&product=Y&name=John&company=Acme&email=john@acme.com` pre-fills Name, Company, and Email fields.
2. URL params are decoded correctly (e.g., `company=Acme%20Corp` → "Acme Corp").
3. Pre-filled fields are editable — the user can change them before submitting.
4. After successful submission, the success state shows a "Back to Product" link (when `productId` is present) and a "Browse More Products" link pointing to `/`.
5. When `productId` is not present, only "Browse More Products" appears.
6. The 429 response body includes `{ error: "...", retryAfter: <seconds> }` where `retryAfter` is the number of seconds until the oldest timestamp in the window expires.
7. The client displays "Too many requests. Try again in X minutes." (or "X seconds" if under 60s) instead of the generic error.
8. The mobile sticky CTA has `pb-[env(safe-area-inset-bottom)]` or equivalent Tailwind safe-area padding.
9. The page content above the sticky CTA has enough bottom padding that the last lot row is not obscured.
10. All changes pass `npx tsc --noEmit`.

---

## Files to Touch

| File | Change |
|------|--------|
| `app/contact/page.tsx` | Read `name`, `company`, `email` from `searchParams` and pass to `EnquiryForm` |
| `app/contact/EnquiryForm.tsx` | Accept new props, pre-fill `form` state. Add navigation links to success state. Display rate-limit countdown. |
| `app/api/enquiries/route.ts` | Compute `retryAfter` seconds from `enquiryTimestamps` and include in 429 response |
| `app/product/[id]/page.tsx` | Add safe-area padding to sticky CTA div; add bottom padding to content container |

**Do not modify:** `lib/document-requests.ts` (DB-based rate limit is separate and does not need `retryAfter`).

---

## Test Plan

These are UI-level and API-level changes. No new test file required, but the rate limit `retryAfter` computation can be verified manually:

1. Submit 5 enquiries from the same email rapidly → 6th returns 429 with `retryAfter` > 0.
2. Verify countdown displays on the form.
3. Navigate to `/contact?name=Test&company=TestCo&email=test@test.com` → fields pre-filled.
4. Submit → success shows navigation links.
5. Test on iOS Safari (or responsive mode) → sticky CTA does not overlap content; safe-area padding visible on notch devices.

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
- [ ] Documentation Checklist complete — see `docs/workflow.md` (roadmap.md updated)