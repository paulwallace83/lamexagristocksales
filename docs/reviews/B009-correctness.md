# Correctness Review — B009

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B009-agent-file-import.md

## Critical (must fix before merge)

None found.

TypeScript (`npx tsc --noEmit`) passes clean. All 133 tests pass. No crashes or type errors.

## Important (should fix, can be next batch)

- **[lib/agent-tools.ts:1105–1108 — `import_inventory_file` case]** — Missing pre-validation of reference data files. The other sync tools (`run_sync_diff` at line 710, `apply_sync` at line 985, `dry_run_sync` at line 1042) all check `existsSync()` for `suppliers.json`, `warehouses.json`, and `exclusion-rules.json` before calling into the pipeline. `import_inventory_file` skips this and calls `importFromBuffer()` directly. If any reference file is missing, `importRows()` throws ENOENT from `readFileSync()`, which the try/catch reports as `"Failed to parse file: ENOENT: no such file or directory, open '.../suppliers.json'"`. This is misleading — the uploaded file parsed fine; the reference data is missing. Fix: add the same `existsSync` guards for `suppliers.json`, `warehouses.json`, and `exclusion-rules.json` with clear error messages (e.g., `"Reference data missing: suppliers.json not found. Run get_reference_data first."`).

- **[lib/agent-tools.ts:1107–1158 / lib/excel-import.ts:873–881 — empty spreadsheet handling]** — Requirement #13 in `docs/batches/B009-requirements.md` specifies that an empty spreadsheet (0 data rows) should return `{ error: "No data rows found in the uploaded file" }`. Current behavior: if the sheet has only headers (or no rows), `XLSX.utils.sheet_to_json()` returns `[]`, `importRows([], dataDir)` succeeds with 0 products, and the tool returns `{ success: true, stats: { totalRows: 0, includedProducts: 0, ... } }`. It also writes an empty `inventory-proposed.json`. If the user then proceeds through the sync workflow without noticing, `apply_sync` would wipe all inventory. While the agent's multi-step confirmation flow would likely catch this, an explicit error at the import step is safer and matches the documented requirement. Fix: in `import_inventory_file` (or in `importFromBuffer`), check if `allRows.length === 0` after parsing and return an error.

## Minor (nice to have)

- **[lib/excel-import.ts:873–881 — `importFromBuffer`]** — No guard for a workbook with zero sheets. If `XLSX.read()` returns a workbook where `SheetNames` is empty, `wb.SheetNames[0]` is `undefined`, and `XLSX.utils.sheet_to_json(wb.Sheets[undefined])` would throw a TypeError. The try/catch in the agent tool catches this, so it won't crash the server, but the error message from xlsx may be cryptic. Triggered by: uploading a technically valid but completely empty workbook file. Fix: add `if (!wb.SheetNames.length) throw new Error("No sheets found in the uploaded file")` before accessing `wb.SheetNames[0]`.

- **[tests/agent-sync-tools.test.ts]** — Test plan item #24 (`importFromBuffer()` unit test confirming parity with `importExcel()` for same data) is not implemented. All `import_inventory_file` tests mock `importFromBuffer()`, so the actual buffer-to-rows parsing path is never exercised in tests. The refactor from `importExcel()` to the shared `importRows()` core is straightforward, but an integration-level test with a real small XLSX buffer would catch any xlsx library edge cases.
