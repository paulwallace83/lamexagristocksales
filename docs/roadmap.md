# Roadmap
This roadmap organizes planned work for the Lamex Agri Stock Sales application. It is intentionally concise and should be updated as priorities change.

## Completed
### ✅ Planning Protocol (v0.5.0+)
- Repository workflow formalized in `AGENTS.md` and `docs/workflow.md`.
- Planner/sole-code-writer model documented. Slice-based planning established.

### ✅ Inventory Publishing Workflow (v0.6.0)
- Weekly sync system implemented (`lib/sync.ts`, `scripts/sync-inventory.ts`).
- Repeatable workflow: paste → parse → diff → approve → sync → reconcile.
- Automatic COO and warehouse validation during sync.
- Customer names stripped during pivot table parsing (enforced by Claude).
- Snapshot history for rollback (`data/snapshots/`).
- Reconciliation report verifies totals match raw data before sign-off.

### ✅ Data Quality And Validation (v0.6.0, partial)
- COO validated on every listing during sync — missing COO flagged as blocking warning.
- Warehouse city/state validated during sync — unknown warehouses flagged.
- New suppliers auto-detected, COO inference attempted from listing data.
- New warehouses auto-detected, city/state inferred from listing data.
- Reference files (`suppliers.md`, `warehouses.md`) auto-regenerated after each sync.

### ✅ Lot Segregation & Visibility (v0.8.0)
- QA dashboard shows per-lot COA status pills with lot numbers, contract refs, and supplier names.
- Product detail page restyled with navy accent borders, two-line lot layout, and lot count headers.
- Inventory table shows lot count badges on desktop and mobile.
- Lot data seeded from inventory.json with automatic aggregation of duplicate ERP rows.
- Role-based authorization hardened across QA pages and API endpoints.

### ✅ Inventory UX & QA Dashboard Enhancements (v0.9.0)
- Public inventory grouped by format (IQF, Juice Concentrate, Puree) with collapsible sections.
- Cascading filters — each dropdown narrows to available values given the other active filters.
- QA dashboard filter (All / Missing / Partial / Complete) with counts for quick focus.
- Partial document status (amber badges and lot pills) distinguishes "some docs" from "no docs".
- Prominent Lamex reference numbers on QA upload page.
- Past-BBD dates highlighted with amber label on product detail pages.
- Security hardening: file upload size/type limits, auth on document GET API, strong AUTH_SECRET.

### ✅ Discount & Clearance Inventory (v0.9.1–0.9.2)
- Discount section on public inventory page (amber collapsible group below format groups).
- Lot-level deduction: discount lots removed from regular inventory immediately on creation and re-applied automatically during weekly sync.
- Admin portal (`/admin/discount`) with lot picker for multi-select moves with per-lot overrides.
- Post-sync validation and auto-deduction in sync pipeline.
- Comprehensive user guide (`docs/user-guide.md`) for wiki publishing.
- Security hardening: production auth fix (`trustHost`), calendar date validation, upload path boundary check, orphan file cleanup, session maxAge.

### ✅ AI Assistant — Internal Agent Portal (v0.9.3)
- Claude-powered chat interface at `/admin/agent` for QA and ops staff.
- 12 tools: inventory queries, lot/contract lookup, document upload, discount management, import review, sync info.
- File analysis: upload PDFs/images in chat, Claude reads and proposes matches to inventory records.
- Confirmation model: all action tools require explicit user approval before execution.
- Streaming SSE responses with tool activity indicators.
- Auth: QA + reviewer roles only. Zero public exposure.

### ✅ Agent UX & Test-Result Tracking (v0.9.4 — S008)
- Branded as "Top Dog Paul's AI Brain" (TDPAIB) with custom avatar.
- Markdown rendering for agent responses (tables, bold, headers, lists, blockquotes).
- True streaming via `anthropic.messages.stream()` for token-by-token delivery.
- Drag-and-drop file upload support.
- File persistence across conversation turns (per-user temp directory, 30 min TTL).
- Max iterations warning when 10-step tool-use limit is reached.
- Full-viewport chat layout (fixed positioning, no footer bleed).
- Test-result recognition: COA vs test-result distinction based on issuer (supplier vs third-party lab).
- QA dashboard: organic/conventional labels, separate Heavy Metals and Pesticide columns.
- `list_products` includes active discount items alongside regular inventory.
- Fixed SQL join bug that inflated product weight totals (38M → 3.5M lbs).
- Zero-stock products (moved to discount) filtered from product list.
- Security hardening: per-user file isolation, error message sanitization, product existence validation, link URL scheme validation.

## Active Priorities
### 1. Marketing Email
- Build HTML email template for weekly inventory broadcast.
- Highlight new arrivals and featured items.
- Mobile-responsive design with CTA to hosted inventory page.

### 2. Data Quality (remaining)
- Validate unit types are correctly identified per product during sync.
- Flag potential duplicate products with similar names/specs.

## Near-Term Candidate Slices
- S007: Marketing email template and generation workflow.
- S009: Batch document upload via agent (multi-file COA matching in one turn).
- S010: Conversation persistence (save/resume agent chat sessions).
- S011: Agent-powered weekly sync assistant (paste pivot data in agent, auto-parse and sync).
- S012: Customer inquiry portal (public-facing quote request with agent-assisted follow-up).

## Planning Notes
- Prefer slices that produce a visible operational improvement in one pass.
- Avoid bundling unrelated admin, UI, and data work together.
- When business data is missing, create a planner task before an implementation task.
- Weekly sync workflow is now the primary method for inventory updates — raw edits to `inventory.json` should only happen via Claude-assisted sync.
