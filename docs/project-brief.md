# Project Brief — Lamex Agri Stock Sales

**Scope:** This is the product context layer — WHY the system exists, WHO it serves, and WHAT constraints are non-negotiable. For implementation rules see `CLAUDE.md`. For technical architecture see `docs/Architecture.md`. For deep workflow docs see `agent_docs/`.

---

## 1. Product Identity

Lamex Agri Stock Sales is a trading company that buys and sells processed fruit and vegetable commodities internationally (IQF, purees, juice concentrates, dehydrated, freeze-dried, aseptic, canned). This system is a web application that bridges Lamex's internal ERP with the buyer market — it publishes inventory, manages food safety documentation, and facilitates quote requests without any manual intervention. It is simultaneously an internal operations tool and a customer-facing marketing surface. Currently deployed on Railway (`https://lamexagristocksales-production.up.railway.app/`). Production domain pending: `www.lamexagrifoodsinventory.com`. **Pre-launch — not yet shared with customers.**

---

## 2. The Problem Before This System

| Domain | Before |
|--------|--------|
| Inventory publication | ERP Excel pivot table exports emailed or communicated by phone. No structured web view for buyers. |
| Document management | COAs, spec sheets, lab results, and label photos stored ad-hoc with no systematic linkage to lots or contracts. Buyers called or emailed to request them. |
| Quote workflow | No self-service mechanism. All quote requests went through Paul directly by phone or email. |
| Marketing | No scalable way to notify buyers of new stock. Manual email construction per campaign. |
| Discount/clearance | No dedicated mechanism to surface near-expiry or overstock lots with pricing to buyers. |
| Compliance | No systemic enforcement of "never show customer names or pricing publicly." Manual processes created exposure. |

---

## 3. Who Uses This System

### Paul Wallace — Business Owner and Sole Developer
- **Goal:** Run operations with minimal manual overhead. Weekly sync should be routine, not stressful.
- **Surfaces:** AI assistant (`/admin/agent`), marketing email (`/admin/email`), discount management (`/admin/discount`), all admin tools, QA portal, import review.
- **Constraint:** Solo developer. Any solution requiring ongoing manual maintenance compounds his workload. Maintainability always wins over sophistication.
- **Note:** QA and Reviewer role functions are currently performed by Paul. These will be separated into distinct users when operational volume requires it — this document will be amended at that point.

### Buyer / Customer (Public)
- **Goal:** Find relevant stock quickly, verify food safety documentation, and initiate a quote request — without phoning anyone.
- **Surfaces:** Public inventory page (`/`), product detail pages (`/product/[id]`), enquiry form.
- **Profile:** Sophisticated commodity traders — food manufacturers, distributors, importers. Familiar with Brix, COA, COO, and standard commodity trade terminology. No hand-holding required on domain language.
- **Constraint:** No login required. Must work on mobile. Data shown must be trustworthy — no stale stock, no missing COO.

---

## 4. What the System Does

### Inventory Publishing
- Weekly ERP data flows: Excel pivot export → `import-excel` → proposed JSON → diff review → `sync` → SQLite → public page
- Products grouped by format with cascading filters (commodity, organic, warehouse)
- COO mandatory before any lot is published; system flags and blocks on missing COO

### Document Management
- Per-lot: COA, test results (pesticide, heavy metals, microbiological, etc.)
- Per-contract: spec sheets, label photos, product photos
- Document coverage tracked per product (complete / partial / missing) on QA dashboard
- AI-assisted upload via TDPAIB agent; COA parameters auto-extracted via Claude Haiku vision

### Quote and Enquiry Flow
- All quotes initiated via "Request Quote" on product detail pages
- Buyers can request document downloads via enquiry form (no login needed)
- Admin review queue for document request approvals (`/admin/requests`)
- No pricing on public pages — quote-only model

### Discount and Clearance
- Lot-level moves from regular inventory to a dedicated clearance section
- Asking price permitted here only (the single exception to the no-pricing rule)
- Automatically deducted from regular inventory on every sync (ERP re-sends these lots weekly)

### Marketing Emails
- Weekly inventory email composed via `/admin/email`
- Products flagged New Arrival (auto, set by sync) or Featured (manual toggle)
- Sent via Resend; template includes stats bar, new arrivals, featured products, full inventory summary

### AI Assistant (TDPAIB)
- Conversational interface for inventory queries, document uploads, discount management, COA backfill
- Confirmation required before any data-modifying action
- Conversation history persisted in SQLite; API usage tracked

---

## 5. Business Constraints and Non-Negotiables

These are the *why* behind the rules in `CLAUDE.md` and `.claude/rules/data-privacy.md`.

**Customer name confidentiality**
Lamex's customer relationships are commercially sensitive. Revealing which customers hold which stock could damage negotiations or expose competitive positions. Row 3 of every pivot table is a customer name — stripped unconditionally. No customer name appears anywhere in output, emails, code comments, or agent responses. This is not a regulatory requirement; it is a core competitive constraint.

**Pricing confidentiality**
Lamex negotiates prices individually with each buyer. Published pricing would undermine that model and expose margin data to competitors. No price column on the public inventory page. All pricing via offline quote flow. Exception: discount/clearance items may show an asking price (already distressed goods at below-market rates where public pricing aids quick turnover).

**COO mandatory**
Country of Origin is a legal labelling requirement in food commodity trade. It affects import duties, country-of-origin declarations on final products, and food safety audit trails. The system blocks publication of any lot with an unresolved COO.

**Data collected via enquiry form**
The enquiry form collects buyer name, company, email, and document requests. No formal legal framework (GDPR/CCPA/NDA) is currently in place. Collected data is used solely to fulfil document requests and is not shared with third parties.

**Document retention**
Uploaded documents (COAs, spec sheets, test results) are retained for 30 days after the parent product exits inventory, then removed. Documents linked to active inventory are kept indefinitely.

**Single developer and simple infrastructure**
All architecture decisions are filtered through "can Paul maintain this alone?" No SaaS databases, no multi-region infrastructure, no external queues. SQLite on a Railway volume is deliberate — simple, portable, inspectable, and recoverable without specialist ops knowledge.

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Weekly sync end-to-end | < 10 minutes |
| QA document coverage | 100% of lots with uploaded COAs present in QA portal |
| Buyer self-service | Buyers can download COA/spec without contacting Lamex directly |
| Marketing email generation | < 5 minutes per campaign via TDPAIB |
| COO completeness | Zero published items with missing COO |
| Sync data integrity | Reconciliation totals match ERP within rounding tolerance |

---

## 7. What This System Is Not

- **Not a CRM.** No customer records, no deal pipeline, no contact history. Customer data is confidential and not collected.
- **Not an ERP.** Reads from the ERP but never writes back. The ERP is the source of truth for inventory quantities.
- **Not a pricing engine.** No automated pricing, no price lists, no discount calculations.
- **Not multi-tenant SaaS.** One company, one Railway instance, one developer.
- **Not designed for horizontal scale.** SQLite + Railway volume do not support multi-instance deployment. This is intentional — not a gap to fill.

---

## 8. Key Terminology

| Term | Definition |
|------|-----------|
| Product | Commodity + format combination (e.g., "Strawberry IQF") |
| Listing | A product at a specific warehouse + supplier |
| Lot | A batch within a listing, identified by the supplier's lot number (e.g., `25AJCA207B`) |
| Contract | Lamex reference number linking a lot to a purchase (format: `XXXXXX-YY`) |
| COA | Certificate of Analysis — issued by supplier or manufacturer per lot |
| Test Result | Third-party lab report (SGS, Eurofins, GFL, Bureau Veritas) — distinct from COA |
| COO | Country of Origin — mandatory field on every lot; affects labelling and import duties |
| BBD | Best Before Date — tracked per lot; past-BBD displayed in amber, never removed |
| IQF | Individually Quick Frozen — whole or cut pieces frozen individually |
| Brix | Sugar content measurement (°Bx) — primary quality parameter for JC and purees |
| Organic | USDA NOP certified only — must appear explicitly in source data (NOP, Organic, Org) |
| Conventional | Default type when organic certification is not explicit |
| Trading Company | Supplier that sources from multiple origins; displays as "Various" (Unitrade HK, Pacific Jade) |
| TDPAIB | "Top Dog Paul's AI Brain" — internal name for the AI assistant at `/admin/agent` |
| Sync | The weekly process of importing ERP data, reviewing diffs, and publishing to SQLite |
| Backfill | Re-running COA parameter extraction against previously uploaded files |

---

## 9. Document Map

| Topic | File |
|-------|------|
| Business rules, compliance rules, constraints | `CLAUDE.md` |
| Hard-won implementation lessons | `LESSONS.md` |
| Technical architecture | `docs/Architecture.md` |
| Near-term and medium-term roadmap | `docs/roadmap.md` |
| Agent operating protocol, task lifecycle | `docs/workflow.md` |
| Weekly sync, Excel import, diff review | `agent_docs/weekly-sync.md` |
| QA document portal, naming convention, lot model | `agent_docs/documents.md` |
| COA extraction, display rules, backfill | `agent_docs/coa-data.md` |
| Discount inventory, lot deduction, sync validation | `agent_docs/discount.md` |
| AI assistant (TDPAIB) architecture and tools | `agent_docs/agent-tdpaib.md` |
| Marketing email workflow | `agent_docs/email-marketing.md` |
| Document request workflow, enquiry form | `agent_docs/document-requests.md` |
| Database schema | `agent_docs/db-schema.md` |
| Public inventory page, product detail page | `agent_docs/public-pages.md` |
| Security hardening checklist | `security.md` |
| Data privacy rules (quick reference) | `.claude/rules/data-privacy.md` |
