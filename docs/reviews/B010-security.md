# Security Review — B010

**Reviewer:** Fresh agent session
**Date:** 2026-04-07
**Batch:** `docs/batches/B010-coa-review-queue.md`

## Files reviewed

- `lib/coa-data.ts` — `reviewCoaData()`, `getCoaReviewQueue()`, `upsertCoaData()` changes, `exportCoaData()`/`relinkCoaData()` review column additions
- `lib/db.ts` — B010 migration (3 new columns on `coa_data`)
- `app/api/coa-review/route.ts` — new API route (GET + POST)
- `app/product/[id]/page.tsx` — public display gating on `reviewStatus === 'approved'`
- `app/qa/(protected)/QADashboardClient.tsx` — review panel, lot pill colors, pending-review filter
- `lib/agent-tools.ts` — `review_coa_data` tool definition + execution
- `app/api/agent/chat/route.ts` — system prompt update (rule 1 confirmation list)
- `lib/documents.ts` — `coaReviewStatus` + `pendingCoaReviewCount` on `ProductDocStatus`
- `tests/coa-data.test.ts` — review workflow tests

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

- **`app/api/coa-review/route.ts:70-71`** — **Unbounded array length in POST body**. The `lotIds` array has no upper bound on length. An authenticated user could submit thousands of IDs, each causing a sequential SQLite UPDATE. While auth is required and SQLite serialises writes (preventing corruption), a very large array could hold the DB write lock for an extended period, blocking other requests. Fix: Add a reasonable cap (e.g., `if (lotIds.length > 500) return 400`). Severity: Low — requires authenticated session and SQLite handles it safely, but it's a defence-in-depth measure.

## Minor (nice to have)

- **`lib/db.ts:253-263`** — **Non-atomic multi-statement migration**. The B010 migration runs 3 sequential `ALTER TABLE` statements. If the first succeeds but a later one fails, the `hasReviewStatus` guard would skip the migration on next startup, leaving `reviewed_at`/`reviewed_by` columns missing. In practice, SQLite `ALTER TABLE ADD COLUMN` for nullable TEXT columns cannot fail after the first succeeds (no constraints, no default expressions), so this is theoretical. A transaction wrapper would make it bulletproof. No action required.

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — `GET` and `POST` in `/api/coa-review/route.ts` both check `session?.user` and role `qa`/`reviewer`
- [x] No secrets in source code or logs — no new secrets introduced; no `console.log` of sensitive data
- [x] All user input validated before use in SQL queries (parameterised) — `getCoaDataForLots()` uses `?` placeholders with spread; `reviewCoaData()`, `upsertCoaData()`, `getCoaReviewQueue()` all use `?` parameterised queries; `getDocumentStatus()` uses a static query
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — no new file operations in this batch; all changes are database-level
- [x] No customer names, pricing, or sensitive ERP fields in any output — API responses contain only lotId, lotNumber, productName, review metadata, and formatted COA fields (brix, acidity, etc.); none of these are sensitive per data-privacy rules
- [x] Unauthorised access returns 404 (not 403) for file/document routes — both GET and POST return `{ error: "Not found" }` with status 404 for unauthenticated/unauthorised requests
- [x] File uploads validated server-side (size, MIME type, filename characters) — no new upload paths in this batch
- [x] Error responses contain no stack traces, file paths, or internal details — API returns generic error strings ("action must be 'approve' or 'reject'", "lotIds must be a non-empty array"); client-side error display shows HTTP status codes only

## Detailed analysis

### Injection — Clean

All SQL queries introduced or modified in B010 use parameterised statements via `better-sqlite3`:
- `reviewCoaData()` — 4 `?` placeholders for UPDATE
- `getCoaReviewQueue()` — optional `?` for productId filter; base clause is a static string
- `getCoaDataForLots()` — dynamic IN clause built from `lotIds.map(() => "?").join(",")` with spread values
- `upsertCoaData()` — 7 `?` placeholders for INSERT/ON CONFLICT
- `exportCoaData()` / `relinkCoaData()` — static or parameterised queries

`JSON.parse` in `getCoaDataForLots()` and `getCoaReviewQueue()` is wrapped in try/catch. `req.json()` in the API POST handler is wrapped in try/catch.

### Authentication & Authorization — Clean

`/api/coa-review` GET and POST both verify `session?.user` with role check (`qa` or `reviewer`). Unauthenticated requests receive 404 (not 401/403), consistent with the security policy to avoid revealing endpoint existence.

`review_coa_data` agent tool is correctly NOT in `REVIEWER_ONLY_TOOLS`, allowing both `qa` and `reviewer` access. The agent chat route handler already requires an authenticated session with `qa` or `reviewer` role before tool execution begins.

The `uploaderEmail` used for audit trails (`reviewed_by` field) is extracted from the session object server-side — not from user-supplied input.

### Data Exposure — Clean

**Public product page gating (`app/product/[id]/page.tsx`):**
```typescript
const coaApproved = coaData?.reviewStatus === "approved";
const formattedFields = coaApproved && coaData ? formatCoaFields(coaData.fields) : [];
```

This correctly suppresses COA field pills and test-type badges (heavy metals, pesticide) for pending/rejected data. The public page renders as a server component — unapproved COA data exists in server memory during render but is never serialised to the client HTML.

Document-based test badges remain visible regardless of review status (per requirements). Only AI-extracted COA badges are gated.

The AI caveat disclaimer ("AI-extracted — may contain errors") only renders when `formattedFields.length > 0`, which means only for approved data. Correct.

**API response content:** The `GET /api/coa-review` response includes `updatedBy` (values like "auto-extract", "backfill", "agent") and `reviewedBy` (email address). These are only exposed to authenticated admin users — acceptable for an internal tool.

### File Upload & Serving — Not applicable

No new file operations in this batch. All changes are database-level review status management.

### Configuration — Clean

No new environment variables or secrets. `lib/coa-data.ts` is server-only (imports `lib/db.ts`). The client component `QADashboardClient.tsx` interacts only via fetch to the API route — no direct SQLite imports.

### Input Validation — Solid

**API POST `/api/coa-review`:**
- Body parsed with try/catch around `req.json()`
- `action` validated as exactly `"approve"` or `"reject"`
- `lotIds` validated as non-empty array
- Each element: parsed with `parseInt`, checked with `Number.isFinite()` and `> 0`
- Invalid elements are skipped (counted as `skipped`), not rejected

**Agent tool `review_coa_data`:**
- `productId`: String-converted, max 200 chars
- `action`: validated as exactly `"approve"` or `"reject"`
- `lotNumbers`: filtered for strings, trimmed, each capped at 100 chars
- Scoped through `getCoaReviewQueue(productId)` — only pending/rejected lots for the specified product

**Migration (`lib/db.ts`):**
- `PRAGMA table_info` check prevents double migration
- `CHECK(review_status IN ('pending','approved','rejected'))` enforces valid values at the DB level
- Migration DEFAULT `'approved'` correctly grandfathers existing rows per LESSONS.md guidance
