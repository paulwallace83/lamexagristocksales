# Security Review — B008

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** `docs/batches/B008-post-sync-email-suggestion.md`

## Scope

Files reviewed (all B008 changes vs `main`):
- `lib/agent-tools.ts` — 2 new tool definitions + 2 execution cases
- `app/api/agent/chat/route.ts` — system prompt extended (rule 13, confirmation-required list)
- `tests/agent-sync-tools.test.ts` — new test file

Dependencies verified:
- `lib/product-flags.ts` — `clearFlags()` implementation
- `lib/db.ts` — `product_flags` table schema

---

## Critical (must fix before merge)

None found.

---

## Important (should fix, can be next batch)

None found.

---

## Minor (nice to have)

- **`lib/agent-tools.ts:617–625`** — **Parameterisation style inconsistency**. The `get_new_arrivals` SQL query uses a string literal `'new_arrival'` directly in the SQL rather than a parameterised `?`. This is safe (the value is a constant, not user input), but is inconsistent with `clearFlags()` in `lib/product-flags.ts:112` which uses `WHERE flag = ?` with a bound parameter. Consider using a parameterised query for consistency with the rest of the codebase: `WHERE pf.flag = ?` with `'new_arrival'` as a bound parameter. No security impact — purely a code hygiene observation.

---

## Category Analysis

### Injection
No user-controlled input flows into any SQL query or file path in the new code. `get_new_arrivals` uses a fully static SQL query with a hardcoded `'new_arrival'` literal. `clear_new_arrivals` delegates to `clearFlags("new_arrival")` which uses a parameterised query (`WHERE flag = ?`). No JSON.parse on user input. No path operations. **No issues found.**

### Authentication & Authorization
Both new tools are executed via `executeTool()`, which is called only from the route handler at `app/api/agent/chat/route.ts:60–69`. The route handler verifies `await auth()` and checks `session.user.role` is `qa` or `reviewer` before any processing — returning 401 otherwise. Both roles can access `/admin/agent` per the Architecture surface-to-role mapping. `get_new_arrivals` is read-only (appropriate for both roles). `clear_new_arrivals` modifies data but is a flag-clearing operation, not a privileged admin action. Both tools are appropriately gated. **No issues found.**

### Data Exposure
`get_new_arrivals` returns `{ productId, productName, flaggedAt }`. The `productName` field comes from `products.product` (e.g. "Apple Juice Concentrate (Organic)") — this column contains no customer names, pricing, or sensitive ERP data. Customer names are stripped during import and never stored in the `products` table. `clear_new_arrivals` returns `{ success, cleared }` — a count only. Error responses from the route handler (line 256–264) send generic messages, not stack traces. System prompt rule 13 includes a markdown link to `/admin/email` — an internal route protected by reviewer auth, not an external URL or redirect. **No issues found.**

### File Upload & Serving
No file operations in the new code. **Not applicable.**

### Configuration
No secrets referenced, logged, or hardcoded in the new code. No new environment variables. **No issues found.**

### Input Validation
`get_new_arrivals` accepts no input parameters (`input_schema: { properties: {}, required: [] }`). `clear_new_arrivals` also accepts no input parameters. Neither tool passes any user-controlled value to a database query, file path, or external call. The `clearFlags()` function receives a hardcoded `"new_arrival"` string. The `product_flags` table has a CHECK constraint (`flag IN ('new_arrival','featured')`) providing an additional database-level guard. **No issues found.**

---

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — no new routes; tools gated via existing auth in `route.ts:60–69`
- [x] No secrets in source code or logs — none introduced
- [x] All user input validated before use in SQL queries (parameterised) — no user input in new queries
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — no file operations in new code
- [x] No customer names, pricing, or sensitive ERP fields in any output — `get_new_arrivals` returns only product ID, product name, and flag timestamp
- [x] Unauthorised access returns 404 (not 403) for file/document routes — no new file routes
- [x] File uploads validated server-side (size, MIME type, filename characters) — no new upload logic
- [x] Error responses contain no stack traces, file paths, or internal details — existing error handling covers new tool cases
- [x] `clear_new_arrivals` added to confirmation-required tool list in system prompt (rule 1) — verified in diff
