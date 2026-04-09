# B011 — Requirements Checklist

## Functional

### Viewport / Safe-Area Setup
- [ ] `app/layout.tsx` exports a `viewport` of type `Viewport` from `next` that includes `viewportFit: "cover"`
- [ ] Existing `metadata` export remains unchanged (only adding a new export, not moving viewport into metadata)
- [ ] Rendered HTML includes `<meta name="viewport" content="...viewport-fit=cover">`

### URL Param Pre-Fill
- [ ] `app/contact/page.tsx` reads `name`, `company`, `email` from `useSearchParams()` and passes them to `EnquiryForm`
- [ ] `EnquiryForm` accepts optional `initialName`, `initialCompany`, `initialEmail` props
- [ ] Form state initialises from props: `name: initialName || ""`, etc.
- [ ] URL-encoded values are decoded correctly (e.g., `Acme%20Corp` → "Acme Corp") via `URLSearchParams.get()` (auto-decoded by the platform)
- [ ] Pre-filled fields are editable — user can type over them
- [ ] Missing params are ignored (partial pre-fill works: only `name` provided → only name filled)
- [ ] The "Request Quote" link on product detail page (`app/product/[id]/page.tsx` lines 84, 120) is unchanged (does not include contact params)

### Enquiry Success Navigation
- [ ] After successful submission, the success state (currently lines 150–180 of `EnquiryForm.tsx`) includes a navigation block
- [ ] "Back to Product" links to `/product/{productId}` and only appears when `productId` is present
- [ ] "Browse More Products" link points to `/` and always appears
- [ ] Links use brand styling: `text-[#4a90c4] hover:underline text-sm font-medium`
- [ ] Links use `next/link` `Link` component (not raw `<a>`)
- [ ] Existing success message content preserved (checkmark icon, "Enquiry Submitted" heading, doc-request follow-up note)

### Rate Limit Cooldown
- [ ] `checkEnquiryRateLimit()` returns `{ allowed: boolean; retryAfter: number }` instead of just `boolean`
- [ ] `retryAfter` is the number of seconds until the oldest timestamp in the window expires (when a slot opens), computed as `Math.ceil((oldest + windowMs - now) / 1000)`, clamped to `>= 0`
- [ ] When `allowed === false`, the 429 response body includes `{ error: "...", retryAfter: <number> }`
- [ ] When `allowed === true`, callers ignore `retryAfter` (value is `0`)
- [ ] Client parses `retryAfter` from the 429 response JSON and stores it in state
- [ ] Client displays `"Too many requests. Try again in X minutes."` when `retryAfter >= 60` (using `Math.ceil(retryAfter / 60)`)
- [ ] Client displays `"Too many requests. Try again in X seconds."` when `retryAfter < 60`
- [ ] DB-based rate limit (doc requests, lines 169–176) continues to return generic message — no `retryAfter` field added there

### Mobile Sticky CTA
- [ ] Sticky CTA div (`app/product/[id]/page.tsx` line 118) replaces `p-4` with `px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`
- [ ] Outer content container (`<div className="max-w-5xl mx-auto px-4 py-8">`, line 42) gains `pb-32 md:pb-8` so the last lot row clears the sticky CTA on mobile
- [ ] No visual regression on desktop (sticky CTA is `md:hidden`; outer container's mobile-only `pb-32` is overridden by `md:pb-8`)
- [ ] Shadow and border styling preserved on the sticky CTA

---

## Error Handling

- [ ] Submit failure with non-429 error: existing generic error display still works (`submitError` shown in red banner)
- [ ] 429 with no `retryAfter` in body: falls back to generic "Too many requests" message (defensive — server should always send it, but client tolerates missing field)
- [ ] Invalid JSON response: existing `.catch(() => ({}))` fallback at line 135 still works
- [ ] Submitting state (`submitting`) disables the submit button and shows "Submitting..." (existing — confirm preserved)

---

## Edge Cases

- [ ] All 5 URL params provided (`productId`, `product`, `name`, `company`, `email`): all fields pre-filled, product displayed as read-only header
- [ ] No URL params: form renders as "Contact Us" with empty fields (existing behavior, unchanged)
- [ ] `email` param with invalid format: pre-filled but browser HTML5 validation catches on submit (`type="email"`)
- [ ] Rate limit hit on in-memory limiter only: 429 with countdown
- [ ] Rate limit hit on DB doc-request limiter only (in-memory passed): 429 with generic message (no countdown — preserved by design)
- [ ] User submits without `productId` → success state shows only "Browse More Products", not "Back to Product"
- [ ] `retryAfter` value when all 5 slots used within 1 second: ~3600 seconds → displays "Try again in 60 minutes."
- [ ] `retryAfter` of exactly 60 seconds → displays "Try again in 1 minutes." (acceptable for an internal-grade tool)
- [ ] iOS Safari with notch: safe-area padding visible on sticky CTA (requires viewport-fit=cover from Step 1)
- [ ] Non-iOS browsers / no notch: `env(safe-area-inset-bottom)` resolves to `0px`, so `calc(1rem + 0px)` = 16px (matches original `p-4`)

---

## Tests

No new test file required — UI + API-level changes verified manually:

- [ ] Navigate to `/contact?name=Test&company=TestCo&email=test@test.com` → name, company, email fields pre-filled
- [ ] Navigate to `/contact?name=John&company=Acme%20Corp&email=john%40acme.com` → company shows "Acme Corp"
- [ ] Submit (no productId) → success shows only "Browse More Products"
- [ ] Navigate from product detail "Request Quote" → submit → success shows both "Back to Product" and "Browse More Products"
- [ ] curl POST 6× to `/api/enquiries` with same email → 6th returns 429 with `retryAfter` > 0
- [ ] In browser, trigger 429 → form shows "Too many requests. Try again in X minutes." (or seconds)
- [ ] Mobile responsive mode: sticky CTA does not overlap last lot row; safe-area padding visible if device has notch
- [ ] Desktop view: no visual changes to product detail page or enquiry form
- [ ] `npx tsc --noEmit` passes
