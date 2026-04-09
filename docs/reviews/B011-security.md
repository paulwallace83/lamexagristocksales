# Security Review — B011

**Reviewer:** Fresh agent session
**Date:** 2026-04-09
**Batch:** [docs/batches/B011-enquiry-flow-polish.md](../batches/B011-enquiry-flow-polish.md)

## Scope of Review

Files modified in B011 (per `git diff main`):

| File | Nature of change |
|---|---|
| [app/api/enquiries/route.ts](../../app/api/enquiries/route.ts) | `checkEnquiryRateLimit` now returns `{ allowed, retryAfter }`; 429 body includes `retryAfter` seconds |
| [app/contact/EnquiryForm.tsx](../../app/contact/EnquiryForm.tsx) | Accept `initialName`/`initialCompany`/`initialEmail` props; pre-fill form state; render nav links on success; render friendly countdown for 429 |
| [app/contact/page.tsx](../../app/contact/page.tsx) | Read `name`, `company`, `email` from `useSearchParams()` and pass to `EnquiryForm` |
| [app/layout.tsx](../../app/layout.tsx) | Add `viewport` export with `viewportFit: "cover"` |
| [app/product/[id]/page.tsx](../../app/product/%5Bid%5D/page.tsx) | Add Tailwind safe-area / bottom padding to mobile sticky CTA wrapper and outer container |

Documentation-only edits to `CLAUDE.md`, `LESSONS.md`, `docs/epics.md`, `docs/roadmap.md` were not in scope for security analysis.

---

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **[app/api/enquiries/route.ts:39](../../app/api/enquiries/route.ts#L39)** — Minor information disclosure via `retryAfter`. The 429 response now leaks the exact remaining cooldown for an email key, which (in combination with the existing 5/hour limit) confirms whether a given email has previously hit the threshold within the window. This is an intentional UX trade-off that mirrors the standard HTTP `Retry-After` semantics, and the in-memory map is per-process and short-lived (10-minute cleanup, 1-hour window). No remediation recommended — accept as a deliberate design choice. If you ever want to harden this further, you could clamp `retryAfter` to a coarse bucket (e.g., round up to the nearest 5 minutes) so the precise timing is not exposed.

- **[app/contact/EnquiryForm.tsx:51-58](../../app/contact/EnquiryForm.tsx#L51-L58)** — `initialName`/`initialCompany`/`initialEmail` flow from `useSearchParams()` straight into the form's React state and back into `<input value={…}>`. React escapes these in JSX, so there is no XSS path, and the API still validates length/email format on submit. Worth noting only because the URL-parameter pre-fill creates a phishing-friendly URL pattern (an attacker could craft `/contact?name=Victim&company=…&email=victim@example.com` and link a victim to a pre-completed enquiry). The user must still manually click "Send Enquiry" — no auto-submit — and the email is editable, so this does not enable spoofing on its own. No remediation needed; flagged so future maintainers do not introduce auto-submit on mount.

---

## Category-by-Category Findings

### Injection
**None found.**

- No SQL was added or modified. Existing parameterised paths (`createDocumentRequest`, `getRecentRequestCount`) remain in use; both bind values via `.run(?, ?, …)` / `.get(?, ?)` (`lib/document-requests.ts:113-127`, `lib/document-requests.ts:192-195`).
- No new `path.join` / `fs.*` operations introduced anywhere in the diff.
- `JSON.parse` on the request body is wrapped in try/catch (`app/api/enquiries/route.ts:54-58`).
- The `email.toLowerCase()` map key in `checkEnquiryRateLimit` is not used in a path or query — it is a key in an in-memory `Map`.
- The new `retryAfter` field is computed from numeric timestamps only — no string interpolation.

### Authentication & Authorization
**None found.**

- The `/api/enquiries` route is intentionally unauthenticated — it is the public buyer enquiry endpoint per `docs/Architecture.md` ("Public enquiry form … No public session"). B011 did not change this.
- No new admin / role-gated routes were created. The CLAUDE.md role rules and the `qa` / `reviewer` boundaries are untouched.
- No new file-serving routes — the 404-vs-403 rule for restricted file categories does not apply.
- The viewport export in `app/layout.tsx` is render-time configuration with no auth implications.

### Data Exposure
**None found.**

- The enquiry route's success/error payloads (`{ success, documentRequestId }`, `{ error: "Failed to submit enquiry" }`) are unchanged from the pre-B011 shape, except for the additional `retryAfter` numeric field on 429.
- All API error strings remain static — no user input is echoed in error messages, so the friendly client-side error display (`submitError`) cannot reflect attacker-controlled content from the server.
- No customer names, pricing, trader codes, or finance fields appear in any modified file.
- The pre-fill flow only ever displays the buyer's *own* contact details that they (or whoever crafted the URL) supplied — not internal CRM data.
- The catch-all error handler at `app/api/enquiries/route.ts:248-258` continues to log full errors server-side and return a generic message. No stack traces or file paths leak to the client.
- `console.error("Enquiry submission error:", err)` (line 253) and the email-failure logs at lines 211 and 235 do log the buyer's email indirectly via `err`, but no secrets/tokens. Pre-existing behavior, not introduced by B011.

### File Upload & Serving
**None found.**

- B011 makes no changes to file upload, file serving, or `getUploadsRoot()`/`getUploadDir()` paths.
- The mobile sticky CTA changes in `app/product/[id]/page.tsx` are pure Tailwind class additions (`px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]` and an outer `pt-8 pb-32 md:pb-8`). No filesystem or path-construction logic was touched.

### Configuration
**None found.**

- The new `viewport` export in `app/layout.tsx` uses Next's typed `Viewport` and contains only public layout values (`width`, `initialScale`, `viewportFit`). No secrets, no environment variables, no DB or filesystem references.
- No new client-side imports of `better-sqlite3` or any server-only module. `EnquiryForm.tsx` and `contact/page.tsx` are `"use client"` and import only `next/link`, `next/navigation`, and React.
- No `process.env.*` references added.

### Input Validation
**None found.**

- The API-side validation in `app/api/enquiries/route.ts` is unchanged: `requesterName`, `requesterCompany`, `requesterEmail`, `productName`, `requesterPhone`, `message`, `productId`, `requestedDocs[].lotNumber`, `requestedDocs[].baseContract`, and `requestedDocs[].categories` all retain `typeof` + length + allow-list checks (lines 72-166).
- The new client-side fields (`initialName`, `initialCompany`, `initialEmail`) feed into the form's state, but the **server** still re-validates the same fields on submit. The client never trusts the URL params for anything security-relevant.
- `productId` from URL → form → API → `createDocumentRequest` continues to flow through the existing `typeof productId !== "string" || productId.length > 200` guard before reaching the parameterised SQL insert.
- The new `retryAfter` value is server-computed from `Date.now()` and `windowMs` only. No user-controlled input contributes to its calculation.

---

## Defensive Notes

These are observations, not findings — recording them so future-you doesn't have to re-verify:

1. **Spread operator on `timestamps` array** (`route.ts:39`) — `Math.min(...timestamps)` is safe because the array length is bounded by `maxPerHour` (= 5). Even if a buggy future change removed the cap, V8's argument limit (~32k) would not be reached at this scale.

2. **Rate-limit slot replenishment is correct** — when the limit is hit, `timestamps.push(now)` is *not* executed (the `return { allowed: false }` is taken first), so a brute-forcer cannot extend their own cooldown indefinitely by hammering the endpoint.

3. **`retryAfter` clamp** — `Math.max(0, …)` guarantees the field is never negative even under clock skew.

4. **In-memory map durability** — `enquiryTimestamps` is per-process. Multi-instance Railway deployments would weaken the limit linearly with instance count. This is a pre-existing characteristic, not a B011 regression. The DB-backed `getRecentRequestCount` limiter (line 181) provides a cross-instance backstop for the document-request path.

5. **Phishing-style pre-fill URLs** — discussed in Minor #2. Mitigations already in place: no auto-submit, email field is editable, server enforces same validation regardless of pre-fill source.

6. **`useState` initialiser does not re-run on prop change** — captured in `LESSONS.md` (UI Components section). Not a security issue, but the lesson is correct: stale form state from re-mount-less navigation could cause a buyer to send an enquiry under the wrong email if the URL changes mid-session. Currently mitigated because each navigation to `/contact` from a product page is a fresh route load.

---

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — *N/A: no new routes; existing public enquiry route unchanged in scope*
- [x] No secrets in source code or logs
- [x] All user input validated before use in SQL queries (parameterised) — *DB calls in `lib/document-requests.ts` use parameter binding; no new SQL added*
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — *no filesystem operations introduced*
- [x] No customer names, pricing, or sensitive ERP fields in any output
- [x] Unauthorised access returns 404 (not 403) for file/document routes — *N/A: no file/document routes touched*
- [x] File uploads validated server-side (size, MIME type, filename characters) — *N/A: no upload code touched*
- [x] Error responses contain no stack traces, file paths, or internal details

---

## Conclusion

B011 is a low-risk UI/UX polish batch. It introduces no new authentication boundaries, no new persistence or filesystem code, no new injection sinks, and no new sensitive-data outputs. The single semantic addition — `retryAfter` on the 429 response — is a deliberate, conventional pattern that improves UX with an acceptable, intentional information disclosure.

**Recommendation:** Approve for merge. No remediation work required.
