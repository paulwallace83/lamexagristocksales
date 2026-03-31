# Security Hardening

## HTTP Security Headers

Configured in `next.config.ts` via the `headers()` function:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables camera, microphone, geolocation
- `Strict-Transport-Security` — forces HTTPS (1 year, includeSubDomains)
- `Content-Security-Policy` — restricts resource loading to same origin; `frame-ancestors 'none'`

## CSRF Protection

`middleware.ts` validates the `Origin` header on all non-GET requests to `/api/*`. If the Origin host doesn't match the request Host, the request is rejected with 403. Requests without an Origin header (server-to-server, curl) pass through since they can't carry SameSite=Lax cookies.

## Path Traversal Protection

All user-supplied path segments (productId, lotNumber, baseContract, category, filename) are sanitized before use in filesystem operations. Two-layer defence:

1. **Structural segments** (used in directory names) — passed through `safeSeg()` which strips `/\?%*<>` and control characters while preserving spaces and pipes valid in filenames.
2. **Final resolved path check** — every file read and write asserts `resolve(filepath).startsWith(resolve(uploadsRoot) + "/")` before proceeding. Any path that resolves outside the uploads root is rejected without revealing details.

`generateDocFilename()` additionally passes `lotNumber`, `baseContract`, and `countryOfOrigin` through `sanitizeSegment()` before embedding them in the filename string, preventing a `/` in a supplier-formatted lot number from being interpreted as a path separator.

## Input & Error Hardening

- **`lib/conversations.ts`** — `JSON.parse(file_names)` from the DB is wrapped in try-catch; malformed rows fall back to `[]` rather than crashing the conversation fetch.
- **`lib/document-requests.ts`** — `JSON.parse(requested_docs)` wrapped in try-catch; malformed rows return an empty docs array.
- **`app/api/document-requests/[id]/route.ts`** — `readFileSync` inside `existsSync` guard is wrapped in try-catch; a file deleted between the check and the read is logged and skipped, other attachments still send.
- **`lib/auth.ts`** — database errors in `getUsers()` are logged to console; auth still fails securely (empty user list means no valid login).
- **`lib/agent-tools.ts`** — both upload and COA backfill path traversal guards use `startsWith(uploadsRoot + "/")` with the trailing slash, preventing prefix-match bypass against sibling directories.

## COA Data Filtering

COA data is extracted by AI and stored as raw JSON in the `coa_data` table. The public product detail page filters this data before display using `EXCLUDED_PATTERNS` in `lib/coa-data.ts`. This is a **defence-in-depth** measure — sensitive lab data should not appear on the public site.

**Filtering mechanism:** Field names are normalized (lowercase, spaces/dots/hyphens → underscores), then checked for substring matches against the exclusion list. Heavy metal symbol patterns use both prefix and suffix forms (`_pb`, `pb_`) to catch `lead_pb`, `Pb_content`, etc.

**Known limitation:** CamelCase field names without separators (e.g., `TotalPlateCount`, `HeavyMetal`) bypass normalization and won't match exclusion patterns. This is low risk because Claude Haiku extraction consistently uses underscore-separated keys, but should be monitored if extraction prompts or models change.

**Audit procedure:** After any change to `EXCLUDED_PATTERNS` or the extraction model, run:
```bash
node -e "
const db = require('better-sqlite3')('lamex.db');
const rows = db.prepare('SELECT data FROM coa_data').all();
const allKeys = new Set();
for (const r of rows) { for (const k of Object.keys(JSON.parse(r.data))) allKeys.add(k); }
console.log([...allKeys].sort().join('\n'));
"
```
Then verify no sensitive fields (heavy metals, microbiology, mycotoxins, admin) appear in the displayed set.

## Security Review Checklist

When making changes to the areas below, verify security is maintained:

| Area | What to Check | How to Verify |
|------|---------------|---------------|
| COA public display | No sensitive fields (heavy metals, micro, mycotoxins) leak to product page | Run audit procedure above; check `EXCLUDED_PATTERNS` in `lib/coa-data.ts` |
| Document access | Restricted docs (COA, test-results, specs) require auth | Check `app/api/files/[...path]/route.ts` returns 404 for unauthenticated requests to restricted paths |
| QA/Admin routes | All `/qa/*`, `/admin/*`, `/review/*` require auth | Check each `layout.tsx` calls `auth()` and redirects |
| API endpoints | All state-changing endpoints require auth | Check each `route.ts` calls `auth()` before processing |
| File uploads | Path traversal blocked, MIME types validated | Check `safeSeg()` + `resolve().startsWith()` in upload routes |
| CSRF | Origin header validated on non-GET API requests | Check `middleware.ts` |
| User input | No unsanitized user data rendered in HTML | React JSX auto-escapes; verify no `dangerouslySetInnerHTML` usage |
| COA extraction model | Field names use underscore convention | Spot-check extracted data after model/prompt changes |

## Key Files

- `middleware.ts` — CSRF origin validation middleware
- `next.config.ts` — Security headers configuration
- `lib/coa-data.ts` — COA display filtering (`EXCLUDED_PATTERNS`, `detectCoaTestTypes()`, `HEAVY_METAL_FALSE_POSITIVES`)
- `lib/country-flags.ts` — Country name → flag emoji mapping (shared by inventory table and product detail page)
- `scripts/migrate-lot-dirs.ts` — One-time migration: renames upload directories from lot-ID to lot-number format, backfills `lot_numbers` column
