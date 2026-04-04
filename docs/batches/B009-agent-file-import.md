# B009 — Agent CSV/Excel File Import

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Goal

Allow the TDPAIB agent to accept CSV and Excel file uploads for the weekly inventory sync, replacing the copy-paste workflow that breaks with large datasets. The agent processes uploaded files through the existing import pipeline (exclusion rules, warehouse/supplier normalization) and writes `inventory-proposed.json`, then continues with the established sync tools.

---

## Background

The current weekly sync workflow (system prompt rule 14) requires the user to paste raw pivot table data into the agent chat. For large inventories, the pasted text exceeds practical limits — too many input tokens, leaving insufficient room for tool iterations.

The `importExcel()` function in `lib/excel-import.ts` already handles the full parsing pipeline: product description parsing, exclusion rule filtering, warehouse/supplier resolution, and structured inventory output. It currently only accepts a file path. The `xlsx` library (already installed) supports `XLSX.read(buffer)` for in-memory parsing of both Excel and CSV formats.

The agent already handles file uploads (PDFs, images) via multipart form data → `fileMap`. The new tool follows the same pattern: resolve the file from `fileMap`, process it, return results.

**Key prior work:** B004 (sync-apply lib), B005 (agent sync read tools), B006 (agent sync write tools), B007 (dry-run mode).

---

## Scope

### In scope
- Add CSV/XLSX/XLS MIME types to server and client upload allowlists
- Refactor `importExcel()` to share core logic with a new `importFromBuffer()` function
- New `import_inventory_file` agent tool (action, reviewer-only) that processes uploaded spreadsheets
- Skip sending spreadsheet content blocks to Claude (not renderable)
- Update system prompt rule 14 to prefer file upload over paste
- Unit tests for the new tool and buffer import function

### Out of scope
- Changes to the `/review` portal — it already handles `import-review.json`
- Changes to the existing sync tools (`run_sync_diff`, `apply_sync`, `get_reconciliation`)
- Changes to `npm run import-excel` CLI beyond delegating to shared logic
- Streaming progress for large file parsing (xlsx is synchronous, fast enough)

---

## Acceptance Criteria

1. Dragging a `.csv`, `.xlsx`, or `.xls` file onto the agent chat shows it as a pending file chip
2. The file picker accepts CSV and Excel files alongside existing PDF/image types
3. `import_inventory_file` tool reads an uploaded file, applies exclusion rules, writes `data/inventory-proposed.json` and `data/import-review.json` (if soft-excluded items exist)
4. Tool returns product count, listing count, total weight, total quantity, exclusion breakdown, and warnings
5. Tool requires `reviewer` role — `qa` users get a role error
6. System prompt instructs the agent to confirm before calling `import_inventory_file`
7. Spreadsheet files are NOT sent as base64 content blocks to Claude — only accessible via `fileMap`
8. After successful import, the agent proceeds with `run_sync_diff` → existing sync workflow
9. `npm run import-excel -- <path>` still works (delegates to shared logic)
10. Invalid/corrupt files return a descriptive error, not a crash

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/excel-import.ts` | Add `importFromBuffer()` — shared core extracted from `importExcel()` |
| `lib/agent-tools.ts` | Add `import_inventory_file` tool definition + execution case; add to `REVIEWER_ONLY_TOOLS` |
| `app/api/agent/chat/route.ts` | Add CSV/XLSX MIME types to `ALLOWED_MIME_TYPES`; skip content blocks for spreadsheets; update `SYSTEM_PROMPT` rule 14 + rule 1 |
| `app/admin/agent/AgentChat.tsx` | Add CSV/XLSX to `ALLOWED_TYPES`; update file input `accept`; update drop overlay text |
| `tests/agent-sync-tools.test.ts` | Add tests for `import_inventory_file` tool |
| `agent_docs/agent-tdpaib.md` | Update capabilities list and security section with new MIME types |
| `agent_docs/weekly-sync.md` | Add file upload as preferred alternative to paste |

**Do not modify:** `data/inventory.json`, `lib/sync-apply.ts`, `lib/sync.ts`, existing sync tools in `agent-tools.ts`.

---

## Files to Read (Context)

- `lib/excel-import.ts` — Current import logic to refactor
- `lib/agent-tools.ts` — Tool definition and execution patterns
- `app/api/agent/chat/route.ts` — Upload pipeline and system prompt
- `app/admin/agent/AgentChat.tsx` — Client-side file type filtering
- `data/exclusion-rules.json` — Exclusion rules loaded by import

---

## Test Plan

Extend `tests/agent-sync-tools.test.ts` with:

```ts
describe("import_inventory_file", () => {
  // Build a minimal XLSX buffer using the xlsx library
  // with 2-3 rows of valid ERP data
  
  it("imports Excel buffer and writes inventory-proposed.json")
  it("imports CSV buffer and writes inventory-proposed.json")
  it("returns error when file not in fileMap")
  it("returns error for corrupt/empty file")
  it("requires reviewer role")
});
```

Add unit tests for `importFromBuffer()` in a new or existing test file confirming parity with `importExcel()`.

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
- [ ] Documentation Checklist complete — CLAUDE.md, agent_docs updated
