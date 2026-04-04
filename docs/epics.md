# Epics

Logical clusters of related work. Each epic maps to a theme from the roadmap. Batches in `docs/batches/` reference their parent epic.

**Status key:** `active` — current sprint | `next` — highest priority backlog | `backlog` — planned but not scheduled | `icebox` — low priority / exploratory

---

## E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `active` (B004+B005+B006+B008 done; B007 remaining)
**Value:** Removes the need for a Claude Code session to run routine weekly inventory updates. Paste pivot data directly in the TDPAIB agent chat → auto-parse → sync to DB.
**Roadmap items:**
- ~~Sync-apply library extraction + lot insertion fix~~ ✓ B004
- ~~Agent-powered sync read tools~~ ✓ B005
- ~~Agent-powered sync write tools~~ ✓ B006
- Sync dry-run `--dry-run` flag (B007) (Operational Improvements)
- ~~Post-sync email suggestion: new-arrival tools + system prompt~~ ✓ B008
- Automated email scheduling after sync (Near-Term)

**Acceptance shape:** Paul can complete a weekly sync entirely within the `/admin/agent` interface with no terminal access required.

---

## E2 — Data Quality: Sync Validation Completions
**Status:** `active` (B001 done — unit type + duplicate checks; COA review queue remaining)
**Value:** Closes the remaining gaps in the weekly sync validation layer. Bad data is caught before publication.
**Roadmap items:**
- ~~Validate unit types are correctly identified per product during sync~~ ✓ B001
- ~~Flag potential duplicate products with similar names/specs~~ ✓ B001
- COA extraction review queue — flag lots for QA verification before going public (Medium-Term)

**Acceptance shape:** Sync output includes a validation summary that flags unit type anomalies and probable duplicates. Lots with unreviewed auto-extracted COA data are marked pending.

---

## E3 — QA Workflow: Document Management Improvements
**Status:** `active` (B002 done — pending request badge; B003 done — inline delete/upload; supplier/status filters next)
**Value:** QA can manage the full document lifecycle from the `/qa` portal without needing the agent or admin tools.
**Roadmap items:**
- ~~Delete/upload docs from expanded QA panel~~ ✓ B003
- Filter by supplier or doc status on QA dashboard (Medium-Term)
- ~~Pending request badge on nav~~ ✓ B002
- QA upload progress: spinner/toast during COA extraction (UX Polish)
- Agent doc gap report: automated email after sync listing lots missing COAs (Operational Improvements)

**Acceptance shape:** QA can delete, replace, and filter documents from the dashboard without leaving `/qa`. New document requests appear as a badge on the nav without navigating to requests.

---

## E4 — Sales Intelligence: Enquiry & Lead Tracking
**Status:** `backlog`
**Value:** Gives Lamex visibility into buyer behaviour — what products are attracting interest, how quickly enquiries are resolved, which buyers are active.
**Roadmap items:**
- Enquiry tracking: persist all enquiries to DB (Near-Term)
- Admin dashboard homepage: pending requests, missing docs, last sync, quick links (Medium-Term)
- Email delivery tracking: Resend webhooks for delivered/bounced/opened on document requests (Medium-Term)
- Admin requests: sortable columns (date, product) (UX Polish)

**Acceptance shape:** Every enquiry submission is persisted. Admin dashboard shows pending request count, last sync date, and unresolved enquiries. Delivery status is visible on each document request.

---

## E5 — Buyer Experience: Self-Service Improvements
**Status:** `backlog`
**Value:** Buyers find and act on relevant stock faster, reducing friction before a quote request.
**Roadmap items:**
- OpenGraph previews on `/product/[id]` (Sales & Marketing)
- Related products on detail page (UX Polish)
- Product comparison — side-by-side spec/COA table (UX Polish)
- Enquiry form URL params for returning customers (UX Polish)
- Enquiry success links: "Back to Product" / "Browse More" (UX Polish)
- Mobile sticky CTA fix (UX Polish)
- Saved search / watchlist via localStorage (Sales & Marketing)
- WhatsApp share button (Sales & Marketing)
- PDF inventory export (Sales & Marketing)
- "3 COAs available" summary badge on product page (UX Polish)
- Rate limit feedback: show cooldown time (UX Polish)

**Acceptance shape:** Product pages are shareable with previews. Mobile experience has no CTA overlap. Buyers can compare products and bookmark commodities.

---

## E6 — Supplier Integration: Document Self-Service
**Status:** `backlog`
**Value:** Suppliers upload their own COAs and test results directly, reducing the manual QA chasing loop.
**Roadmap items:**
- Supplier document portal: shared link upload, no login, auto-matches to contracts (Near-Term)
- Supplier scorecard: track document completeness rate per supplier over time (Operational Improvements)

**Acceptance shape:** Suppliers receive a per-contract upload link. Uploaded files auto-appear in the QA portal matched to the correct lot/contract. Supplier completeness rate is visible on the QA dashboard.

---

## E7 — Customer Portal: Repeat Buyer Access
**Status:** `icebox`
**Value:** Repeat buyers log in to see request history, re-request documents, and receive personalised stock notifications.
**Roadmap items:**
- Customer portal: login, request history, saved pricing, re-request documents (Medium-Term)
- Inventory change notifications: subscribe by commodity for new-arrival emails (Medium-Term)

**Acceptance shape:** Authenticated buyer portal with request history and commodity subscriptions. New arrivals trigger auto-emails to subscribed buyers.

---

## E8 — Reporting & Observability
**Status:** `backlog`
**Value:** Data-driven view of inventory trends, document completeness velocity, agent cost, and system health.
**Roadmap items:**
- Reporting & analytics: inventory trends from snapshots, doc completion velocity, agent cost trends (Medium-Term)
- Inventory age alerts: flag products approaching BBD thresholds (90/60/30 days) (Operational Improvements)
- Health check endpoint: `GET /api/health` (Operational Improvements)
- Commodity price index internal dashboard (Sales & Marketing)

**Acceptance shape:** Admin can view snapshot-derived inventory trends. BBD alerts appear on the admin dashboard. `/api/health` returns DB status, last sync, disk usage.

---

## Priority Order

| Priority | Epic | Rationale |
|----------|------|-----------|
| 1 | E2 — Data Quality | Blocking correctness — bad data getting through sync is a trust issue |
| 2 | E3 — QA Workflow | Daily operational friction for the current primary user (Paul) |
| 3 | E1 — Agent-Powered Sync | Biggest operational efficiency gain; removes terminal dependency |
| 4 | E4 — Sales Intelligence | Needed before launch to understand buyer behaviour from day one |
| 5 | E5 — Buyer Experience | Pre-launch polish directly affecting buyer conversion |
| 6 | E6 — Supplier Integration | High value but requires external coordination |
| 7 | E8 — Reporting | Good to have; can be built incrementally |
| 8 | E7 — Customer Portal | Significant scope; post-launch only |
