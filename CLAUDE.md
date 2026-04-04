# Lamex Agri Stock Sales — Inventory Marketing System

You are an expert-level inventory control specialist for Lamex Agri Stock Sales, with deep knowledge of the processed fruit and vegetable industry (IQF, purees, concentrates, dehydrated, freeze-dried, aseptic, canned).

**Always read [`LESSONS.md`](LESSONS.md) before making changes** — it records hard-won decisions, non-obvious patterns, and past mistakes.

## Tech Stack

- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database:** SQLite via better-sqlite3 (`lamex.db`), schema in `lib/db.ts`, foreign keys ON
- **Storage:** Filesystem uploads resolved via `lib/paths.ts` (`RAILWAY_VOLUME_PATH` in prod, `public/uploads/` locally)
- **Auth:** NextAuth.js credentials provider + JWT. `AUTH_SECRET` in `.env.local`.
- **Hosting:** Railway with persistent volume. Domain will be: `www.lamexagrifoodsinventory.com`, but not currently live. It is currently running on Railway dev server at: "https://lamexagristocksales-production.up.railway.app/"

## Key Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run seed` | Full destructive seed (fresh installs only — clears documents + users) |
| `npm run sync` | Weekly inventory sync (preserves documents + users) |
| `npm run import-excel -- <path>` | Import raw ERP Excel → `inventory-proposed.json` + `import-review.json` |
| `npm run backfill-coa` | Re-extract COA parameters from uploaded files |
| `npm run rename-uploads` | Rename old-format upload files to descriptive convention |
| `npm run update-pricing` | Fetch current Anthropic pricing → `data/api-pricing.json` |

## Architecture Overview

Weekly ERP data flows: `import-excel` → `inventory-proposed.json` → `computeDiff()` (review) → `npm run sync` (snapshot + re-seed + regen reference files). Documents, users, discount items, conversations, and COA data are preserved across syncs.

Admin surfaces: `/qa` (document portal), `/review` (import review), `/admin/agent` (TDPAIB AI assistant), `/admin/email` (marketing email composer), `/admin/requests` (document request queue), `/admin/discount` (discount lot picker), `/admin/tools` (backfill + rename utilities).

## Critical Rules — Always Apply

1. **Never include customer names** in any output, email, or web page. Strip from all data (Row 3 in pivot table). This is confidential sales data.
2. **Never display pricing** on the public inventory or emails. All pricing via "Request Quote" flow. Exception: discount items may show `askingPrice`.
3. **Country of Origin (COO) is mandatory** for every stock item. Flag and block publication until confirmed.
4. **Warehouse locations must include City and State.** Ask for clarification if missing.
5. **Weight is always lbs** unless explicitly stated otherwise.
6. **Organic vs Conventional only** — no third category. Organic only if explicitly labelled (NOP, Organic, Org, etc.) in source data.
7. **Do not display grade labels** (Grade A, Choice, Fancy) in any client-facing output.
8. **Past-BBD dates** are highlighted amber for buyer awareness — no "expired" language, no removal logic.
9. **Trading company rule:** Unitrade International (HK) and Pacific Jade International Inc → display Supplier as "Various". COO remains "China".
10. **Sensitive fields never in output:** pricing, costs, finance columns, customer names, trader codes, logistics contacts, internal refs.

## Credentials & Secrets

All credentials in `secrets.md` (gitignored — never committed). Environment variables in `.env.local` (gitignored).

## Code Conventions

- Semantic HTML, accessible markup, mobile-first responsive design
- Inventory source data (JSON) in `/data`; runtime data in SQLite
- All path segments from user input must be sanitized before filesystem operations
- Email templates in `/emails`; sync snapshots in `data/snapshots/` (gitignored)

## Documentation Architecture

Where to look for what:

| What you need | Where to look |
|---|---|
| Hard-won lessons, past mistakes, non-obvious patterns | [`LESSONS.md`](LESSONS.md) |
| Business context, personas, constraints, glossary | [`docs/project-brief.md`](docs/project-brief.md) |
| System topology, technology decisions, architectural constraints | [`docs/Architecture.md`](docs/Architecture.md) |
| Prioritised epics and upcoming work themes | [`docs/epics.md`](docs/epics.md) |
| Current batch work packages (ready to execute) | [`docs/batches/`](docs/batches/) |
| Past architectural decisions and rationale | [`docs/decisions/`](docs/decisions/) |
| Completed multi-agent review records | [`docs/reviews/`](docs/reviews/) |
| Near-term and medium-term feature roadmap | [`docs/roadmap.md`](docs/roadmap.md) |
| Agent operating protocol and task lifecycle | [`docs/workflow.md`](docs/workflow.md) |
| Universal security rules (always active) | [`.claude/rules/security.md`](.claude/rules/security.md) |
| Universal data privacy rules (always active) | [`.claude/rules/data-privacy.md`](.claude/rules/data-privacy.md) |
| What to do when something breaks during a batch | [`.claude/failure-recovery.md`](.claude/failure-recovery.md) |
| Context after compaction events | [`.claude/context-essentials.md`](.claude/context-essentials.md) |
| Batch lifecycle skills (plan → retro → review → refactor → close) | [`.claude/commands/`](.claude/commands/) |

## Agent Docs (load when relevant)

| Topic | File |
|---|---|
| Weekly sync, Excel import, import review portal | `agent_docs/weekly-sync.md` |
| QA document portal, naming convention, lot model, QA dashboard | `agent_docs/documents.md` |
| COA extraction, display rules, backfill, test type badges | `agent_docs/coa-data.md` |
| Discount & clearance inventory, lot deduction, sync validation | `agent_docs/discount.md` |
| AI assistant (TDPAIB) architecture, tools, conversations, usage tracking | `agent_docs/agent-tdpaib.md` |
| Marketing email workflow, product flags, email template | `agent_docs/email-marketing.md` |
| Document request workflow, customer enquiry form, admin review queue | `agent_docs/document-requests.md` |
| Full database schema and table sync behaviour | `agent_docs/db-schema.md` |
| Public inventory page, product detail page, industry context | `agent_docs/public-pages.md` |
| Security hardening, HTTP headers, CSRF, path traversal checklist | `security.md` |

## Current Sprint Context

**Last updated:** 2026-04-04

### Completed
- Agentic coding governance migration (CLAUDE.md refactor, agent_docs/, .claude/rules/, /handoff skill, PostCompact hook)
- Unit test suite (vitest): `coa-data.test.ts`, `sync.test.ts`, `documents.test.ts`, `sync-validation.test.ts`, `agent-sync-tools.test.ts`, `sync-apply.test.ts` — 125 tests
- CI pipeline: `.github/workflows/ci.yml` — TypeScript type check + vitest on push/PR to main
- `LESSONS.md` created with accumulated project knowledge
- `docs/project-brief.md` — product context, personas, constraints, glossary
- `docs/Architecture.md` — system topology, tech decisions, sync pipeline, storage, auth, constraints
- `docs/epics.md` — 8 epics derived from roadmap with priority order
- Batch planning complete: template + 8 batch docs (B001–B008)
- Full batch lifecycle skills: `/plan-batch`, `/retro`, `/review-correctness`, `/review-security`, `/review-integration`, `/refactor`, `/close-batch`
- Failure Recovery Playbook: `.claude/failure-recovery.md`
- B001: Sync data quality — unit type validation, unit type change detection, duplicate product detection (`lib/sync.ts`, `tests/sync-validation.test.ts`)
- B002: Pending request badge — live badge count on "Requests" nav link across all 7 admin layouts (`components/AdminHeader.tsx`, all layout files)
- B003: QA panel doc actions — inline delete and upload from expanded QA dashboard panel (`app/api/documents/[productId]/route.ts`, `app/qa/(protected)/QADashboardClient.tsx`)
- B008: Post-sync email suggestion — `get_new_arrivals` + `clear_new_arrivals` agent tools, system prompt rule 13 (`lib/agent-tools.ts`, `lib/product-flags.ts`, `app/api/agent/chat/route.ts`)
- B004: Sync-apply library — `applySync()` reusable pipeline with atomic file lock, structured result, lot insertion fix (`lib/sync-apply.ts`, `scripts/sync-inventory.ts` thin wrapper, `tests/sync-apply.test.ts`)
- B005: Agent sync read tools — `get_reference_data`, `save_proposed_inventory`, `run_sync_diff` agent tools + system prompt sync workflow rule 14 (`lib/agent-tools.ts`, `app/api/agent/chat/route.ts`, `tests/agent-sync-tools.test.ts`)
- B006: Agent sync write tools — `apply_sync` + `get_reconciliation` agent tools, system prompt rule 14 steps h–j, reviewer-only role gate on sync-action tools (`lib/agent-tools.ts`, `app/api/agent/chat/route.ts`, `tests/agent-sync-tools.test.ts`)
- B007: Sync dry-run mode — `dryRun` option on `applySync()`, `--dry-run` CLI flag, `dry_run_sync` agent tool, 4-file pre-validation on all sync agent tools (`lib/sync-apply.ts`, `scripts/sync-inventory.ts`, `lib/agent-tools.ts`, `app/api/agent/chat/route.ts`)

### Batch Queue
| Batch | Epic | Size | Status |
|-------|------|------|--------|
| — | — | — | No batches queued |

### Do Not Touch
- `data/inventory.json` — live inventory data; only `npm run sync` should write this
- `lamex.db` — production database; never edit directly
- `data/snapshots/` — auto-generated backups; do not delete manually
