# Security Rules — Always Active

These rules apply to every file operation, API route, and code change in this project.

## Path Traversal Prevention

- Every path segment derived from user input (product ID, lot number, contract number, filename) **must be sanitized** before use in any filesystem operation.
- After constructing a file path, always verify: `resolve(filepath).startsWith(allowedRoot + "/")`. Reject anything that escapes the root.
- Never pass raw query params, URL segments, or form values directly to `path.join()` or `fs.*` functions.
- Reference implementation: `lib/paths.ts`, `lib/documents.ts`

## Auth Guards

- All document read/write routes require authenticated session with `qa` or `reviewer` role.
- Restricted file categories (`coa`, `test-results`, `specs`) in `/api/files/[...path]` return **404** (not 403) for unauthorized access — never reveal file existence to unauthenticated users.
- Admin routes (`/admin/*`, `/review`, `/qa`) must verify role in layout.tsx auth guards.

## File Upload Validation

- Maximum file size: **50 MB** — enforce server-side, not just client-side.
- Allowed MIME types: PDF, JPEG, PNG, GIF, WebP — validate the actual content type, not just the filename extension.
- Reject filenames with path separators (`/`, `\`, `..`).

## Input Sanitization

- Sanitize `lot`, `contract`, and `productId` values before using in filenames or DB queries.
- JSON.parse wrapped in try/catch everywhere — never let malformed JSON crash a route.
- SQL queries use parameterized statements via better-sqlite3 — never string-concatenate user input into SQL.

## Error Handling

- Log full errors server-side; send generic messages to the client.
- Never expose stack traces, file paths, or internal references in API responses.
- Tool errors in the TDPAIB agent must be reported to the user — never silently claim success after a failed tool call.

## Secrets

- `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` live only in `.env.local` (gitignored).
- Credentials in `secrets.md` (gitignored). Never commit plaintext passwords or API keys.
- Never log secrets, tokens, or session data.
