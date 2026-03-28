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

## Active Priorities
### 1. QA Document Operations
- Tighten upload workflow around the IQF/frozen product photo rule.
- Make required-versus-optional document status more obvious in the QA dashboard.

### 2. Public Inventory Experience
- Strengthen filtering and search around buyer-relevant fields.
- Preserve mobile usability while expanding inventory detail visibility.

### 3. Data Quality (remaining)
- Audit current application behavior against CLAUDE.md rules (S002).
- Validate unit types are correctly identified per product during sync.
- Flag potential duplicate products with similar names/specs.

### 4. Marketing Email
- Build HTML email template for weekly inventory broadcast.
- Highlight new arrivals and featured items.
- Mobile-responsive design with CTA to hosted inventory page.

## Near-Term Candidate Slices
- S002: Audit current application behavior against CLAUDE.md rules.
- S007: Marketing email template and generation workflow.

## Planning Notes
- Prefer slices that produce a visible operational improvement in one pass.
- Avoid bundling unrelated admin, UI, and data work together.
- When business data is missing, create a planner task before an implementation task.
- Weekly sync workflow is now the primary method for inventory updates — raw edits to `inventory.json` should only happen via Claude-assisted sync.
