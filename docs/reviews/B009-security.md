# Security Review — B009

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B009-agent-file-import.md

## Scope

Files reviewed (all files changed on `batch/B009` vs `main`):

- `lib/excel-import.ts` — `importFromBuffer()`, `formatReviewSummarySanitized()`, `importRows()` refactor
- `lib/agent-tools.ts` — `import_inventory_file` tool definition + execution, `REVIEWER_ONLY_TOOLS` update
- `app/api/agent/chat/route.ts` — MIME type allowlists, `RENDERABLE_MIME_TYPES`, system prompt rule 14
- `app/admin/agent/AgentChat.tsx` — client-side `ALLOWED_TYPES`, file input `accept`
- `tests/agent-sync-tools.test.ts` — test coverage for new tool

---

## Critical (must fix before merge)

None found.

---

## Important (should fix, can be next batch)

- **[lib/agent-tools.ts:1119](lib/agent-tools.ts#L1119)** — **Data Exposure (customer names in `reason` field)**. The `import_inventory_file` tool writes `import-review.json` with a `reason` field that contains customer names embedded in the string (e.g., `"direct-customer: ACME Corp"`, `"reserved-stock: Customer XYZ"`). These originate from `checkSoftExclusion()` in `lib/excel-import.ts:579,583`. While the tool's own return value correctly uses `formatReviewSummarySanitized()` for the `reviewSummary` field, the file on disk still contains customer names in `reason`. The pre-existing `get_import_review` tool reads this file and returns it unfiltered to the agent chat, where it gets persisted in the `conversations` table. Note: this is an improvement over the CLI flow (which writes the full `ExcludedRow` including `Stock_Contract_Customer`), and the customer name is embedded in a categorisation string rather than a standalone field — but it still violates the "no customer names in any output" rule. Fix: strip the customer name from the `reason` field before writing to `import-review.json` — e.g., `reason.split(":")[0]` or replace the customer portion with a generic label.

- **[app/api/agent/chat/route.ts:165](app/api/agent/chat/route.ts#L165)** — **Path Traversal guard inconsistency**. The temp file path traversal check uses `resolve(dataPath).startsWith(resolve(userTempDir))` without appending `"/"` to the prefix. The established pattern elsewhere (e.g., `lib/agent-tools.ts:517`) uses `startsWith(uploadsRoot + "/")`. Without the trailing slash, a directory named `userTempDir` + extra characters (e.g., a sibling directory `user_email_evil`) would pass the prefix check. In practice this is not exploitable because `dataPath` is constructed via `join(userTempDir, safeName)` which always produces a child path, and the `safeName` regex strips path separators. However, the inconsistency weakens defense-in-depth. Fix: change to `resolve(dataPath).startsWith(resolve(userTempDir) + "/")` to match the project's established pattern.

---

## Minor (nice to have)

- **[lib/agent-tools.ts:1161-1162](lib/agent-tools.ts#L1161-L1162)** — **Error message includes raw exception text**. The `import_inventory_file` error handler returns `"Failed to parse file: ${msg}"` where `msg` is the raw error from `importFromBuffer()` / the xlsx library. Other sync tools in this file (e.g., `apply_sync` at line 1031, `dry_run_sync` at line 1079) return generic messages like `"Sync failed"` without leaking internals. While the tool is behind auth and the xlsx library errors are unlikely to contain sensitive paths, the pattern is inconsistent. Suggestion: return `"Failed to parse file"` (generic) and log the full error server-side only, matching the other tools' pattern.

- **[app/admin/agent/AgentChat.tsx:769](app/admin/agent/AgentChat.tsx#L769)** — **Client file input `onChange` does not filter by MIME type**. The drop handler (line 294) filters files through `ALLOWED_TYPES`, but the file input `onChange` handler at line 769 adds all selected files without type checking. The `accept` attribute provides a browser hint but is not enforced. Server-side validation at `route.ts:155` is the real guard (non-allowed types are silently skipped), so this is not a vulnerability — but a user selecting an unsupported file type would see a pending file chip that silently does nothing. Suggestion: add the same `ALLOWED_TYPES` filter to the `onChange` handler for consistency with the drop handler.

---

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — no new routes added; `import_inventory_file` tool gated behind `REVIEWER_ONLY_TOOLS` (`lib/agent-tools.ts:590`)
- [x] No secrets in source code or logs — no new secrets introduced; `console.error` at line 1160 logs the error object (not secrets)
- [x] All user input validated before use in SQL queries (parameterised) — no new SQL queries added in B009
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — `import_inventory_file` writes only to hardcoded `data/` paths; file content comes from `fileMap` (in-memory); temp file guard present at `route.ts:165` (see Important finding for trailing-slash inconsistency)
- [x] No customer names, pricing, or sensitive ERP fields in any output — `formatReviewSummarySanitized()` correctly strips customer names from agent tool return value; `Stock_Contract_Customer` excluded from `import-review.json` fields (see Important finding for `reason` field residual)
- [x] Unauthorised access returns 404 (not 403) for file/document routes — no new file-serving routes added
- [x] File uploads validated server-side (size, MIME type, filename characters) — CSV/XLSX MIME types added to `ALLOWED_MIME_TYPES` at `route.ts:78-80`; 50 MB limit enforced at line 155; filename sanitised at line 159; spreadsheets correctly excluded from Claude content blocks via `RENDERABLE_MIME_TYPES` check at line 172
- [x] Error responses contain no stack traces, file paths, or internal details — `apply_sync` and `dry_run_sync` return generic messages; `import_inventory_file` includes raw error text (see Minor finding)
