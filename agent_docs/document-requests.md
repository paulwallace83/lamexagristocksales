# Document Request Workflow

COA, test results, and specification sheets are **restricted** — not publicly downloadable. Customers see availability badges on product pages. Document requests are integrated into the unified product enquiry flow — not a separate form.

## Restricted Categories

- `coa` — Certificates of Analysis
- `test-results` — Heavy metals, pesticide, and other lab reports
- `specs` — Specification sheets

**Remain public:** `labels` (label photos), `photos` (product photos)

## Unified Product Enquiry Flow

Product pages have a single "Request Quote" button linking to `/contact?productId={id}&product={name}`. The contact page also accepts optional pre-fill params for returning customers reached via external email/CRM links: `name`, `company`, `email` (URL-encoded). Example: `/contact?productId=apple-iqf&product=Apple+IQF&name=John&company=Acme&email=john@acme.com`. Pre-filled fields remain editable; values are length-clamped before reaching the form to prevent oversized URL injections. The contact page renders a unified enquiry form:

1. Customer fills in contact info (name, company, email, phone, message).
2. If the product has restricted documents, an "Also request product documents" toggle reveals per-lot/contract checkboxes for COA, test results, and spec sheets.
3. `POST /api/enquiries` always sends a sales notification email to `sales@lamexfoods.us`.
4. If documents were selected, also creates a `document_requests` record and sends QA notification to `coa@lamexfoods.us` — concurrent workflow.
5. Rate limited: 5 requests per email per hour. The in-memory limiter (`lib/enquiry-rate-limit.ts`, applied to every enquiry) returns a structured 429 with `{ error, retryAfter }` JSON body and an HTTP `Retry-After` header so the client can show a friendly countdown. The DB-based doc-request limiter (`getRecentRequestCount` in `lib/document-requests.ts`) still returns a generic 429 with no `retryAfter`.
6. General enquiries (no `productId`) show a product text input and no document section.

## Admin Review

- `/admin/requests` — Review queue (requires `qa` or `reviewer` role).
- Status filter tabs: All | Pending | Approved | Rejected | Sent.
- Click into a request to see requester info, requested documents with file availability, and approve/reject form.
- **Approve:** Gathers matching files from disk, emails them to the customer via Resend as attachments, updates status to `sent`.
- **Reject:** Updates status with optional notes.
- If email delivery fails after approval, status stays `approved` (not `sent`) so QA can retry.

## File Serving Restriction

The `/api/files/[...path]` route checks for restricted category names in the path segments. If found, requires `qa` or `reviewer` session. Returns 404 (not 403) for unauthorized access to avoid revealing file existence.

## Database

- `document_requests` table — preserved during weekly sync, cleared during full seed.
- Fields: id, product_id, requester_name, requester_company, requester_email, requester_phone, message, requested_docs (JSON), status (pending/approved/rejected/sent), created_at, reviewed_at, reviewed_by, notes.

## Key Files

- `lib/document-requests.ts` — Types, CRUD, rate limiting, pending count
- `lib/document-request-emails.ts` — Sales notification, QA notification, customer approval email templates
- `lib/email-send.ts` — `sendEmailWithAttachments()` for Resend attachment support
- `app/api/enquiries/route.ts` — POST (public) — unified enquiry endpoint
- `app/api/document-requests/route.ts` — GET (auth) — admin list endpoint
- `app/api/document-requests/[id]/route.ts` — GET + PATCH (auth) — admin review
- `app/api/products/[id]/available-docs/route.ts` — Public GET (no file URLs)
- `app/contact/EnquiryForm.tsx` — Unified customer enquiry form with optional doc request
- `app/admin/requests/` — Admin review queue (layout, page, [id]/page, ReviewFormClient)
