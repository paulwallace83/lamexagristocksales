# B009 Requirements — Agent CSV/Excel File Import

## Functional

1. Agent accepts `.csv`, `.xlsx`, and `.xls` file uploads via drag-and-drop and file picker
2. `import_inventory_file` tool reads an uploaded spreadsheet from `fileMap`, applies exclusion rules, normalizes warehouses/suppliers, and writes `data/inventory-proposed.json`
3. Soft-excluded items written to `data/import-review.json` when present
4. Tool returns: product count, listing count, total weight, total quantity, hard/soft exclusion counts with breakdown, and warnings array
5. Tool requires `reviewer` role — `qa` role gets a role error
6. Tool requires user confirmation before execution (system prompt rule 1)
7. Spreadsheet files are NOT sent as content blocks to Claude (not renderable) — only available via `fileMap`
8. After successful import, agent follows existing sync flow: `run_sync_diff` → resolve warnings → `apply_sync` → `get_reconciliation`
9. Existing `npm run import-excel` CLI continues to work (thin wrapper over shared logic)
10. System prompt rule 14 updated to prefer file upload over paste

## Error Handling

11. Missing file reference → returns `{ error: "File '...' not found. Available files: ..." }`
12. Corrupt/unreadable file → returns `{ error: "Failed to parse file: ..." }`
13. Empty spreadsheet (0 data rows) → returns `{ error: "No data rows found in the uploaded file" }`
14. All rows excluded → returns stats showing 0 included products with exclusion breakdown

## Edge Cases

15. CSV with various delimiters — xlsx library auto-detects
16. File with only hard-excluded rows → `inventory-proposed.json` written with empty products array, stats reflect this
17. File uploaded in a previous conversation turn (loaded from temp dir) → still accessible in `fileMap`
18. Multiple spreadsheet files uploaded at once → agent should call tool once per file (or instruct user to upload one at a time)

## Tests

19. `import_inventory_file` happy path: small Excel buffer → correct stats returned, `inventory-proposed.json` written with expected products
20. `import_inventory_file` happy path: CSV buffer → same result
21. `import_inventory_file` error: file not in fileMap → descriptive error with available files list
22. `import_inventory_file` error: corrupt buffer → parse error message
23. `import_inventory_file` role gate: `qa` role → rejected with role error
24. `importFromBuffer()` unit test: produces identical output to `importExcel()` for same data
25. Loading state: file chip appears immediately on drop/select for CSV/XLSX files
