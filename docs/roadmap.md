# Roadmap

Organized by status. Updated as priorities shift.

---

## Completed

| Version | Slice | Highlights |
|---------|-------|------------|
| v0.5.0 | Planning Protocol | Slice-based workflow formalized |
| v0.6.0 | Inventory Publishing | Weekly sync: paste → diff → approve → reconcile. Snapshot rollback. |
| v0.6.0 | Data Quality (partial) | COO + warehouse validation, supplier/warehouse auto-detection, reference file regen |
| v0.8.0 | Lot Segregation | Per-lot COA status, product detail restyle, lot count badges |
| v0.9.0 | Inventory UX & QA | Format grouping, cascading filters, QA status filter, BBD highlights |
| v0.9.1–2 | Discount & Clearance | Lot-level deduction, admin lot picker, sync validation, user guide |
| v0.9.3 | AI Assistant | Agent portal (`/admin/agent`), 13 tools, file analysis, confirmation model |
| v0.9.4 | Agent UX & Test Results | TDPAIB branding, markdown, streaming, drag-drop, HM/pesticide columns |
| v0.9.5 | Marketing Email | `/admin/email`, Resend integration, auto new-arrivals, featured flags |
| v0.9.6 | Security Hardening | CSRF middleware, CSP/HSTS headers, country flags, transactional inserts |
| v0.9.7 | Conversations & Usage | Chat persistence, usage tracking, stats bar, fuzzy file matching |
| v0.9.8 | QA Doc Visibility | Expand-to-view documents, lazy loading, BBD on lot pills |
| v0.9.9 | Security & Docs Audit | CSP fix, path traversal fix, LIKE injection fix, Railway deployment |
| v0.10.0 | Document Requests | Restricted downloads, unified enquiry form, admin review queue, email attachments |
| v0.10.1 | COA Key Aspects | Auto-extraction via Claude Haiku vision, `coa_data` table, pills on product page |
| v0.10.2 | Batch Document Upload | `batch_lot_lookup` + `batch_upload_documents`, 24+ files in one drop |
| v0.10.3 | COA Backfill & Tools | Backfill agent tools, `/admin/tools` UI, backfill API, pill filtering, AI caveat |
| v0.10.4 | Enquiry Workflow | Remove table/header enquiry buttons; clickable rows with chevron; funnel enquiries through product detail page |
| v0.11.0 | Governance & CI | Agentic coding governance (CLAUDE.md refactor, `agent_docs/`, `.claude/rules/`), unit test suite (59 vitest tests), CI pipeline (type check + vitest on push/PR), `LESSONS.md`, project brief, Architecture doc, epics + batch planning, failure recovery playbook |
| v0.11.1 | Data Quality (B001) | Unit type validation + change detection, duplicate product detection in `validateBusinessRules()`. 17 new tests. |
| v0.11.2 | Pending Request Badge (B002) | Live pending-request count badge on "Requests" nav link across all 7 admin layouts. Badge capped at 99+. |
| v0.11.3 | QA Panel Doc Actions (B003) | Inline delete + upload from expanded QA dashboard panel. All 5 categories rendered. Auth hardened (401→404). DELETE handler uses `getUploadDir()` for consistent path construction. |
| v0.11.4 | Post-Sync Email Suggestion (B008) | `get_new_arrivals` + `clear_new_arrivals` agent tools. System prompt rule 13 guides post-sync new-arrival workflow with email composer link. |
| v0.11.5 | Sync-Apply Library (B004) | Extracted 480-line sync script into reusable `applySync()` in `lib/sync-apply.ts`. Atomic file lock (O_CREAT\|O_EXCL), structured `SyncApplyResult`, lot insertion fix (pre-existing gap), parameterized `rootDir`. Foundation for agent-powered sync (B005–B007). 9 tests. |
| v0.11.6 | Agent Sync Read Tools (B005) | 3 new TDPAIB agent tools (`get_reference_data`, `save_proposed_inventory`, `run_sync_diff`). System prompt rule 14 with 8-step sync workflow. 15 tests. No new routes or tables. |
| v0.11.7 | Agent Sync Write Tools (B006) | 2 new TDPAIB agent tools (`apply_sync`, `get_reconciliation`). System prompt rule 14 steps h–j (apply → reconcile → sign-off). Reviewer-only role gate on sync-action tools. 9 tests (6 tool + 3 role gate). End-to-end sync workflow now completable within `/admin/agent`. |
| v0.11.8 | Sync Dry-Run Mode (B007) | `dryRun` option on `applySync()`, `--dry-run` CLI flag, `dry_run_sync` agent tool. Validates entire sync pipeline without writing data. 4-file pre-validation on all sync agent tools (`apply_sync`, `dry_run_sync`). System prompt step g2 suggests dry-run when user is uncertain. 10 new tests. |
| v0.11.9 | Agent CSV/Excel File Import (B009) | `import_inventory_file` agent tool accepts CSV/XLSX/XLS file uploads via drag-and-drop. `importFromBuffer()` in `lib/excel-import.ts` shares parsing pipeline with CLI. Spreadsheets excluded from Claude content blocks via `RENDERABLE_MIME_TYPES` gate. `sanitizeReviewForExport()` shared function eliminates code duplication. `formatReviewSummarySanitized()` strips customer names for agent path. 135 tests. |

---

## Near-Term

| Slice | Description | Value |
|-------|-------------|-------|
| ~~Agent-powered sync~~ | ~~Paste pivot data or upload CSV/Excel file in agent chat → auto-parse and sync. Removes need for Claude Code session for routine weekly updates.~~ ✓ B004–B009 complete. Full workflow: upload file (or paste) → import → save → diff → dry-run → apply → reconcile → sign-off. | Operational efficiency |
| Enquiry tracking | Persist all enquiries to DB (not just doc requests). Sales gets visibility into lead volume, response times, product interest. | Sales insight |
| ~~Pending request badge~~ | ~~Show document request count on "Requests" nav link across all admin pages.~~ ✓ B002 | QA workflow |
| Automated email scheduling | Schedule weekly marketing emails to send automatically after sync, with manual override. Removes the "remember to send" step. | Consistency |
| Supplier document portal | Let suppliers upload their own COAs and test results via a shared link (no login). Auto-matches to contracts. Reduces QA chasing. | Operational efficiency |

---

## Medium-Term

| Slice | Description | Value |
|-------|-------------|-------|
| QA Dashboard enhancements | ~~Delete/upload docs from expanded panel~~ ✓ B003, filter by supplier or doc status. | QA workflow |
| Admin dashboard homepage | `/admin` landing page: pending requests, missing docs, agent usage, last sync, quick links. | Overview |
| COA extraction review queue | Flag lots for QA review after auto-extraction. Values verified before going public. | Data quality |
| Reporting & analytics | Inventory trends from snapshots, doc completion velocity, agent usage and cost trends. | Business insight |
| Email delivery tracking | Resend webhook events (delivered, bounced, opened) on document requests. QA knows if docs arrived. | Reliability |
| Customer portal | Repeat buyers log in to see request history, re-request documents, saved pricing. Reduces repeat enquiries. | Sales efficiency |
| Inventory change notifications | Buyers subscribe by commodity for auto-email when matching new stock arrives. | Lead generation |

---

## UX Polish

- Enquiry form: accept `name`, `company`, `email` as URL params for returning customers.
- Enquiry success: "Back to Product" and "Browse More Products" links after submission.
- Product page: "3 COAs available" summary badge instead of per-lot badges.
- Admin requests: sortable columns (date, product).
- Rate limit feedback: show remaining cooldown time, not generic error.
- QA upload progress: spinner/toast during COA extraction.
- Related products on detail page: same commodity, different origin/format.
- Product comparison: select 2–3 products for side-by-side spec/COA table.
- Mobile sticky CTA: bottom padding to prevent overlap with fixed "Request Quote" footer.

---

## Operational Improvements

- **Agent doc gap report**: Automated email to QA after each sync listing all lots missing COAs/test results.
- **Supplier scorecard**: Track document completeness rate per supplier over time.
- **Inventory age alerts**: Flag products approaching BBD thresholds (90/60/30 days) on admin dashboard.
- **Health check endpoint**: `GET /api/health` — DB status, last sync, pending requests, disk usage.
- ~~**Sync dry-run**~~: ✓ B007 — `npm run sync -- --dry-run` + `dry_run_sync` agent tool.

---

## Sales & Marketing

- **OpenGraph previews**: Meta tags on `/product/[id]` so shared links show product name, origin, weight.
- **PDF inventory export**: One-click branded PDF of current filtered inventory for procurement teams.
- **Saved search / watchlist**: Buyers bookmark commodities via localStorage. New arrivals highlighted on return.
- **WhatsApp share**: One-tap share button on product pages for buyers who communicate via WhatsApp.
- **Commodity price index**: Internal dashboard tracking market price trends per commodity from trade sources.

---

## Planning Notes

- Prefer slices that produce a visible operational improvement in one pass.
- Avoid bundling unrelated admin, UI, and data work.
- Weekly sync is the primary update method — raw edits to `inventory.json` only via Claude-assisted sync.
