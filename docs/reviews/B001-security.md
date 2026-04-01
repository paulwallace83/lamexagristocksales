# Security Review — B001

**Reviewer:** Fresh agent session
**Date:** 2026-04-01
**Batch:** docs/batches/B001-sync-data-quality.md

## Scope

Files modified or created in this batch:

| File | Change type |
|------|-------------|
| `lib/sync.ts` | Modified — added `CANONICAL_UNIT_TYPES` constant, extended `validateBusinessRules()` with unit type validation, unit type change detection, and probable duplicate detection; updated `SyncWarningType` union; passed `current` inventory to `validateBusinessRules()` from `computeDiff()` |
| `tests/sync-validation.test.ts` | Created — 17 unit tests for new and existing validation checks |

No new API routes, no new database queries, no new file operations, no new client components.

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

### M1 — Duplicate detection composite key uses `|` separator

**File:** `lib/sync.ts`, line 527–531 (the `dupeGroups` key construction)
**Type:** Input Validation (edge case)
**Description:** The duplicate detection key joins commodity, format, specification, and organic with a `|` separator: `[commodity, format, spec, organic].join("|")`. If a commodity or format value ever contains a literal `|` character, two distinct products could collide to the same key, producing a false-positive duplicate warning.
**Attack vector:** Not exploitable — this data comes from the ERP import pipeline (not direct user input), and the warning is informational only (`requiresAction: false`). A false positive would appear in the diff report but would not block sync or alter any data.
**Severity:** Negligible. The retro already flagged this. Current inventory data contains no `|` in commodity/format values. Using `JSON.stringify` or a null byte separator would eliminate the theoretical collision.
**Suggested remediation:** Replace `.join("|")` with `JSON.stringify([...])` for collision-safe keying. Low priority.

### M2 — Unit type change detection assumes `unitType` is always a string at runtime

**File:** `lib/sync.ts`, line 513 (`prev.toLowerCase()`)
**Type:** Input Validation (defensive coding)
**Description:** If `prev` (from `currentUnitTypes.get(product.id)`) is defined but not a string at runtime (e.g., the JSON source has `unitType: null` despite the TypeScript type declaring `string`), calling `.toLowerCase()` would throw an uncaught TypeError. The `!== undefined` guard on line 513 protects against `Map.get()` misses but not against null or non-string values.
**Attack vector:** Not directly exploitable. This function runs server-side during the sync workflow. A crash here would abort the diff report generation, which is an operational issue, not a security issue. The data source is `inventory.json` which is written by the import pipeline.
**Severity:** Negligible. TypeScript enforces the type at compile time. Adding a `typeof prev === "string"` guard would be purely defensive.
**Suggested remediation:** Change `if (prev !== undefined &&` to `if (typeof prev === "string" &&` for runtime safety against malformed JSON.

## Security Checklist

- [x] All new API routes protected by auth check (session + role) — N/A: no new API routes in this batch
- [x] No secrets in source code or logs — confirmed: no secrets, API keys, or credentials in any changed file
- [x] All user input validated before use in SQL queries (parameterised) — N/A: no new SQL queries in this batch
- [x] All user input validated before use in file paths (sanitise + resolve + prefix) — N/A: no new file operations in this batch
- [x] No customer names, pricing, or sensitive ERP fields in any output — confirmed: warning messages include only product names, product IDs, unit types, commodity, and format; no customer names, pricing, trader codes, or sensitive fields are referenced in any new code
- [x] Unauthorised access returns 404 (not 403) for file/document routes — N/A: no new file-serving routes
- [x] File uploads validated server-side (size, MIME type, filename characters) — N/A: no new upload handling
- [x] Error responses contain no stack traces, file paths, or internal details — confirmed: warnings are structured `SyncWarning` objects with controlled message strings; no raw error propagation

## Summary

This batch has an extremely small attack surface. All changes are pure validation logic inside `lib/sync.ts` that runs server-side during the weekly sync diff workflow. There are:

- **No new API routes** — no new entry points for attackers
- **No new database queries** — no SQL injection surface
- **No new file operations** — no path traversal surface
- **No new user input handling** — all data comes from the import pipeline (`inventory.json`, `inventory-proposed.json`)
- **No client-side changes** — no XSS or data exposure surface
- **No sensitive data in outputs** — warning messages reference only product names/IDs and unit types

The two minor findings are theoretical edge cases in data handling, neither exploitable. The batch passes all security checklist items.
