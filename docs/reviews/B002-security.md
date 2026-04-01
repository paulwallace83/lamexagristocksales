# Security Review — B002

**Reviewer:** Fresh agent session
**Date:** 2026-04-01
**Batch:** docs/batches/B002-pending-request-badge.md

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **[components/AdminHeader.tsx:59](components/AdminHeader.tsx#L59)** — **Unescaped numeric output (XSS — theoretical only)**. The `link.badge` value is rendered directly into JSX: `{link.badge}`. Since this value originates from `getPendingRequestCount()` which returns a `number` from a `COUNT(*)` SQL aggregate (no user input), there is no practical XSS risk. React also auto-escapes JSX interpolation. No fix needed — noting for completeness.

- **[components/AdminHeader.tsx:59](components/AdminHeader.tsx#L59)** — **Badge count has no upper bound display cap**. If the `document_requests` table somehow accumulated thousands of pending rows, the badge would display a very large number (e.g., `99999`) which could break the nav layout. Purely cosmetic. Suggestion: cap display at `99+` if count exceeds 99.

## Analysis by Category

### Injection
None found. `getPendingRequestCount()` at [lib/document-requests.ts:201](lib/document-requests.ts#L201) uses a hardcoded SQL string with no user input — `SELECT COUNT(*) AS cnt FROM document_requests WHERE status = 'pending'`. No parameters, no interpolation. Safe.

### Authentication & Authorization
Both layouts call `await auth()` and redirect unauthenticated users before `getPendingRequestCount()` is reached:
- [app/admin/requests/layout.tsx:9-15](app/admin/requests/layout.tsx#L9-L15) — checks session + role `qa`/`reviewer`
- [app/qa/(protected)/layout.tsx:9-11](app/qa/(protected)/layout.tsx#L9-L11) — checks session exists

The pending count itself (an integer) does not leak sensitive data — it reveals only that N requests exist, which is appropriate for authenticated QA/reviewer users who can already see the full requests page.

### Data Exposure
None found. The badge displays only a numeric count. No customer names, pricing, supplier details, or sensitive ERP fields are exposed. No error messages or stack traces can surface from `COUNT(*)`.

### File Upload & Serving
Not applicable — B002 introduces no file operations.

### Configuration
None found. No new secrets, environment variables, or client-side imports introduced. `AdminHeader` is a server component (no `"use client"` directive), so no risk of `better-sqlite3` leaking into a client bundle via the import chain.

### Input Validation
None found. The `badge` prop on `NavLink` is typed as `number | undefined`. It originates from `getPendingRequestCount()` (a DB aggregate) and flows through server-component props only — never from user input, URL params, or form data.

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — no new API routes; badge rendered in existing auth-guarded layouts
- [x] No secrets in source code or logs
- [x] All user input validated before use in SQL queries (parameterised) — no user input in new SQL
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — no file operations
- [x] No customer names, pricing, or sensitive ERP fields in any output — badge is numeric count only
- [x] Unauthorised access returns 404 (not 403) for file/document routes — no new file routes
- [x] File uploads validated server-side (size, MIME type, filename characters) — no upload changes
- [x] Error responses contain no stack traces, file paths, or internal details — no new error paths

## Summary

B002 is a minimal, low-risk change. It adds a read-only integer badge to two existing auth-guarded server-component layouts by calling an existing parameterless DB function. No new attack surface introduced. **Clean pass — no blockers.**
