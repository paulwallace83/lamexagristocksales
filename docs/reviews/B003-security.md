# Security Review — B003

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** `docs/batches/B003-requirements.md`

## Scope

Files changed in B003:
- `app/api/documents/[productId]/route.ts` — auth status code fix (401→404) on GET and DELETE handlers
- `app/qa/(protected)/QADashboardClient.tsx` — delete UI, inline upload form, refresh logic

Supporting files reviewed for context:
- `lib/documents.ts` (removeDocument, getDocumentsForProduct, getUploadDir, safeSeg)
- `lib/paths.ts` (getUploadsRoot)
- `app/api/upload/route.ts` (existing upload handler — upload form delegates here)
- `app/api/files/[...path]/route.ts` (file serving)

---

## Critical (must fix before merge)

None found.

---

## Important (should fix, can be next batch)

- **[app/api/documents/[productId]/route.ts:81-86](app/api/documents/[productId]/route.ts#L81-L86)** — **File deletion before DB record validation (TOCTOU / authorisation gap)**. The DELETE handler deletes the physical file (`unlinkSync`) on line 82 *before* calling `removeDocument(productId, documentId)` on line 85, which verifies the DB record exists. An authenticated QA/reviewer user could provide a valid `productId + filename + category + lotId` combination that resolves to a real file on disk, but supply a non-existent `documentId`. Result: the file is deleted, `removeDocument` returns false, the route returns 404 — but the damage (file deletion) is already done. The orphaned DB record would then point at a missing file. **Attack vector:** Authenticated user crafts a DELETE request with correct path segments but a fake `documentId` to delete arbitrary files within the uploads directory. **Impact:** Limited to files within `uploadsRoot`; requires `qa`/`reviewer` session. **Severity:** Important — not externally exploitable, but violates principle of least surprise and could cause data loss. **Fix:** Call `removeDocument()` first. Only delete the physical file if the DB record was successfully removed:
  ```ts
  const removed = removeDocument(productId, documentId);
  if (!removed) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  // Only delete file after DB confirms the record was real
  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }
  ```

---

## Minor (nice to have)

- **[app/api/documents/[productId]/route.ts:13-15](app/api/documents/[productId]/route.ts#L13-L15)** — **`safePath` does not reject `..` dot segments**. The route's `safePath` regex strips `/\?%*<>"\x00-\x1f` but passes `..` unchanged. `safePath("..")` returns `".."`, so `join(uploadsRoot, "..", ...)` would traverse upward. The `resolve().startsWith()` guard on line 77 catches this, so there is no exploitable vulnerability. However, the stricter `safeSeg` in `lib/documents.ts:370` (`[^a-zA-Z0-9._-]`) would reject `..` by converting it to `__`. Using the stricter pattern (or adding an explicit `..` rejection) would provide better defense-in-depth. **Suggestion:** Add `if (segment.includes("..")) return "_invalid_";` or adopt the `safeSeg` pattern from `lib/documents.ts`.

- **[app/api/documents/[productId]/route.ts:57](app/api/documents/[productId]/route.ts#L57)** — **No category whitelist on DELETE handler**. The upload route validates `category` against `VALID_CATEGORIES` (line 53 of upload route), but the DELETE handler accepts any sanitised string as category. This allows constructing paths like `uploads/{pid}/lots/{lot}/anything/{file}`. Impact is negligible — the file must exist at that path for deletion to occur, and the path is confined to `uploadsRoot`. **Suggestion:** Add a `VALID_CATEGORIES` check mirroring the upload route for consistency.

- **[app/qa/(protected)/QADashboardClient.tsx:326](app/qa/(protected)/QADashboardClient.tsx#L326)** — **Parameter naming: `lotId` carries a lot number, not an ID**. The client sends `doc.lotNumbers[0]` as query param `lotId`, and the server uses it as a directory path segment (which is correct — the upload directory structure uses lot numbers). The naming is misleading and could cause maintenance confusion. Not a security vulnerability, but a future developer might assume `lotId` is a numeric ID and introduce a bug. **Suggestion:** Rename the query param to `lotNumber` in both client and server for clarity.

---

## Positive findings

- **Auth hardening (401→404):** Both GET and DELETE handlers now return 404 for unauthenticated/unauthorised requests, matching the project's security rules. This prevents probing for valid product IDs.

- **Consistent `encodeURIComponent` usage:** The client correctly encodes `productId` in all fetch URLs (`/api/documents/${encodeURIComponent(productId)}`), preventing URL injection.

- **XSS-safe rendering:** Error messages are displayed via React JSX (`{error}`), which auto-escapes HTML. The `window.confirm()` dialog uses native browser UI, not injectable HTML. No `dangerouslySetInnerHTML` anywhere.

- **Upload delegates to existing hardened route:** The new inline upload form POSTs to `/api/upload`, which has server-side file size (50 MB), MIME type, and path traversal validation. No new upload endpoint was created.

- **Parameterised SQL throughout:** `removeDocument` and `getDocumentsForProduct` both use `?` placeholders — no string concatenation of user input into SQL.

---

## Security Checklist
- [x] All new API routes protected by auth check (session + role)
- [x] No secrets in source code or logs
- [x] All user input validated before use in SQL queries (parameterised)
- [x] All user input validated before use in file paths (sanitise + resolve + prefix)
- [x] No customer names, pricing, or sensitive ERP fields in any output
- [x] Unauthorised access returns 404 (not 403) for file/document routes
- [x] File uploads validated server-side (size, MIME type, filename characters) — via existing `/api/upload` route
- [x] Error responses contain no stack traces, file paths, or internal details
