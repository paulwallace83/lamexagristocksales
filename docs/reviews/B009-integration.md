# Integration Review — B009

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B009-agent-file-import.md

## Critical (must fix before merge)

_None._

## Important (should fix, can be next batch)

- **`lib/agent-tools.ts` (lines 1089–1098) vs `executeOneUpload()` (lines 449–466)** — The `import_inventory_file` tool's file resolution comment says "same pattern as upload_document" but the implementation is simpler: it only does exact case-insensitive key and `data.name` matching, whereas `executeOneUpload()` does substring-includes matching in both directions plus numeric digit overlap detection. This means an `import_inventory_file` call could fail to resolve a file that `upload_document` would find. Since Claude generates the `fileName` argument and the key is the sanitized name the system set, exact matching is likely sufficient in practice, but the comment is misleading. Either align the fuzzy matching or fix the comment to say "simplified case-insensitive matching".

- **`lib/agent-tools.ts` (lines 1118–1133) duplicates `scripts/import-excel.ts` (lines 54–70)** — The `sanitizedReview` mapping that transforms `ExcludedRow[]` into the `import-review.json` structure is copy-pasted identically between the agent tool and the CLI script. If a field is added or renamed in one location, the other will diverge. This mapping should be extracted into a shared function in `lib/excel-import.ts` (e.g., `sanitizeReviewForExport(review: ExcludedRow[])`), consistent with the B009 pattern of extracting shared logic into `lib/`. The `/api/review/apply/route.ts` parses this exact structure (fields `product`, `specification`, `warehouse`, `supplier`, `origin`, `contract`, `cases`, `weight`, `unit`, `reserved`, `bbd`, `lotNumber`), so any field divergence would break the review portal merge flow.

- **`lib/agent-tools.ts` (line 1119) — `reason` field still contains customer names** — The `sanitizedReview` object written to `import-review.json` includes `r.reason` which is a string like `"direct-customer: KRAFT HEINZ CO"`. This is a pre-existing pattern from the CLI script, and the `/review` portal already parses and displays it to reviewers. The retro (B009-retro.md) flagged this as item #2 and noted it is pre-existing debt. Documenting here for completeness — the agent tool result itself does not surface the raw `reason` field to Claude (it's only written to disk), but the `import-review.json` file is readable via the `get_import_review` tool, which returns the full file including `reason` fields. A future batch should sanitize the reason to just the category prefix (e.g., `"direct-customer"`) for the agent-accessible file.

## Minor (nice to have)

- **`lib/agent-tools.ts` (line 1102)** — The "no files" placeholder is `"(none)"` while the upload_document equivalent at line 469 uses `"none — please re-upload"`. Minor inconsistency in user-facing error messages. The import tool message is also missing the trailing period present in the upload tool. Should match for consistency.

- **`app/admin/agent/AgentChat.tsx` (line 507)** — Drop overlay text says "PDF, image, CSV, or Excel files" but does not mention the `.xls` (legacy Excel) format specifically. The `accept` attribute at line 766 and `ALLOWED_TYPES` set include `application/vnd.ms-excel`, so `.xls` works, but a user might not realize "Excel files" includes the legacy format. Trivial — no action required.

- **`lib/excel-import.ts` — `formatReviewSummarySanitized()` (lines 958–998) shares ~80% structure with `formatReviewSummary()` (lines 904–952)** — Both functions have identical grouping-by-reason logic and table formatting. The sanitized version omits the customer column and adds row counts. Consider extracting the shared iteration/grouping into a common helper to reduce duplication if either function needs to change in the future. Not urgent — both functions are small and self-contained.

- **`tests/agent-sync-tools.test.ts`** — No test exercises the case where `importFromBuffer` returns an empty products array (all rows excluded). The B009 requirements doc (requirement #16) specifies this edge case should write `inventory-proposed.json` with an empty products array. The mock could be extended with a test case for `mockImportResult.included.products = []` to verify the tool still returns `success: true` with `includedProducts: 0`.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A: B009 does not store new data keyed by lot. The `import_inventory_file` tool writes `inventory-proposed.json` and `import-review.json` which are intermediate files consumed by the existing sync pipeline.
- [x] New tables/columns added to the "preserved during sync" path (if applicable) — N/A: No schema changes. No new tables or columns.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A: No schema changes.
- [x] No assumptions about lot ID stability — Confirmed. `importFromBuffer()` generates temporary lot IDs via `lotIdCounter` (line 659 in `lib/excel-import.ts`) which are only used within the proposed inventory JSON. These are overwritten during `applySync()` which re-inserts with fresh auto-increment IDs. No reliance on lot ID stability.

## Future Batch Readiness

- **No next batch in queue**: B009 is the last listed batch. The batch document notes that after B009, the E1 epic (Agent-Powered Sync) is functionally complete except for "Automated email scheduling after sync."
- **Overall foundation**: Solid. The refactoring of `importExcel()` into `importRows()` + thin wrappers is clean and follows the established pattern from B004 (extracting `applySync()` from the CLI script). The new `import_inventory_file` tool follows the same structure as `apply_sync`, `run_sync_diff`, and other B005–B007 tools: validate inputs, call lib function, return structured result, catch and log errors. The `RENDERABLE_MIME_TYPES` gate prevents sending non-renderable content to Claude, which is a forward-looking pattern that would cleanly support additional non-renderable file types in the future.

## Doc Updates Needed

- [x] CLAUDE.md: Already updated — B009 listed in Completed section with correct file references. `import-excel` command table entry unchanged (still valid). No changes needed.
- [x] Architecture.md: No changes needed. Architecture.md does not contain a specific tool count — it references tools generically ("full tool use", "Tools defined in `lib/agent-tools.ts`").
- [x] LESSONS.md: Already updated — new lesson "Audit function output for customer names when repurposing across contexts" added (lines 177–180), accurately reflecting the `formatReviewSummary()` finding from the B009 retro. No additional lessons needed.
- [ ] `agent_docs/agent-tdpaib.md` line 21: States "24 tools (15 read-only, 9 action)" — should be updated to "26 tools (16 read-only, 10 action)" to reflect the addition of `import_inventory_file` and the correct total count.
- [ ] `docs/epics.md`: E1 description says "B004+B005+B006+B007+B008 done" — should add B009 to the completed list.
