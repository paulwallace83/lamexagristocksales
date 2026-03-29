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

### ✅ Marketing Email (v0.9.5 — S007)
- Weekly marketing email composer at `/admin/email` (reviewer role).
- Resend integration for programmatic email sending.
- Auto-detect new arrivals from sync diffs (`product_flags` table, auto-set by sync script).
- Manual "Featured" flag toggle per product (persists across syncs).
- Self-contained HTML email template with inline CSS, table layout, Outlook compatibility.
- Sections: navy header, stats bar, new arrivals (green), featured (blue), category summary, CTA button.
- Live preview in iframe, manual recipient input (comma/newline separated).
- Product flags API for toggling new_arrival/featured badges.
- Security hardening: HTML escaping in email template, atomic flag toggle, recipient dedup, input size limits, error sanitization, productId validation.

### ✅ Security Hardening & UX Polish (v0.9.6)
- CSRF origin validation middleware for all state-changing API routes.
- HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Country flag emojis on public inventory table and product detail pages (shared `lib/country-flags.ts` utility).
- Transactional document insert (`addDocument`) to prevent orphaned files on partial failures.
- Agent system prompt rule 9: tool errors must be reported to the user immediately.
- Discount API endpoints hardened to require `reviewer` role on all methods.
- Email send error sanitization (whitelist-based safe messages, no internal details leaked).
- Email validation tightened to RFC 5321 simplified pattern.
- Silent catch blocks in `lib/discount.ts` now log errors.

### ✅ Conversation Persistence & API Usage Tracking (v0.9.7 — S010)
- Agent chat sessions saved to SQLite, survive page reloads.
- Conversation list dropdown (up to 20 recent), resume, new chat, per-conversation delete.
- Per-request token usage and cost tracking (`api_usage` table).
- Stats bar above chat: daily/monthly/yearly call count and cost.
- Configurable pricing from `data/api-pricing.json` with `npm run update-pricing`.
- Fuzzy file matching fix for `upload_document` tool (substring + lot-number fallback).
- Security hardening: conversation message validation (role, content size, message count), pricing bounds checks, CSRF middleware fix.

### ✅ QA Dashboard Document Visibility (v0.9.8)
- Expand-to-view documents: click product row chevron (▶) to see all uploaded documents inline.
- Documents lazy-loaded from `GET /api/documents/{productId}` and cached client-side.
- Documents grouped by category (COA, Test Results, Specs, Labels, Photos) with clickable View links.
- Each document shows filename, lot number, BBD (amber highlight if expired), and contract reference.
- BBD dates added to QA lot pills (`BBD: YYYY-MM-DD`), matching public product detail page format.
- Bug fix: document API route was using `lotId` instead of `lotNumber` for URL generation (broken View links).
- Empty state shows "No documents uploaded" with link to upload page.

### ✅ Security Hardening & Documentation Audit (v0.9.9)
- CSP `unsafe-eval` removed from production builds.
- QA layout auth bypass fixed (unauthenticated users now redirected).
- Path traversal trailing-slash fix on documents DELETE endpoint.
- LIKE wildcard injection fix across all agent search queries.
- Plaintext test credentials removed from committed files.
- Full cross-document audit: npm scripts, conversation persistence, site URL, upload paths, stale references corrected.
- Railway deployment support: `lib/paths.ts` volume routing, auto-seed on empty DB, `force-dynamic` pages, API-based file serving.

## Active Priorities
### 1. Data Quality (remaining)
- Validate unit types are correctly identified per product during sync.
- Flag potential duplicate products with similar names/specs.

## Near-Term Candidate Slices
- S009: Batch document upload via agent (multi-file COA matching in one turn). High impact for large shipments (24+ lots).
- S011: Agent-powered weekly sync assistant (paste pivot data in agent, auto-parse and sync). Removes need for Claude Code session for routine syncs.
- S012: Customer inquiry portal (public-facing quote request with agent-assisted follow-up).

## Medium-Term Candidate Slices
- QA Dashboard enhancements: delete documents from expanded panel, upload directly from expanded panel, filter/search by supplier or document status.
- Reporting & analytics dashboard: inventory trends over time (from weekly snapshots), document completion velocity, agent usage patterns and cost trends.

## Planning Notes
- Prefer slices that produce a visible operational improvement in one pass.
- Avoid bundling unrelated admin, UI, and data work together.
- When business data is missing, create a planner task before an implementation task.
- Weekly sync workflow is now the primary method for inventory updates — raw edits to `inventory.json` should only happen via Claude-assisted sync.
