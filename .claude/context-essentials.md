# Context Essentials — Lamex Agri Stock Sales

Re-read CLAUDE.md for full project context. This file is a quick re-injection of the most critical rules after context compaction.

## Project Identity
Next.js inventory marketing system for Lamex Agri Stock Sales. Deployed on Railway. Domain: www.lamexagrifoodsinventory.com

## Critical Rules (Never Forget)
1. NEVER include customer names in any output — strip Row 3 from pivot data unconditionally
2. NEVER display pricing on public pages — "Request Quote" only (exception: discount items)
3. Country of Origin (COO) is MANDATORY — block publication until confirmed
4. Weight is always lbs
5. Organic vs Conventional only — no third category
6. Do NOT display grade labels on client-facing output
7. Past-BBD dates: amber highlight only, no "expired" language, no removal
8. Trading companies (Unitrade HK, Pacific Jade): display Supplier as "Various"
9. All path segments from user input must be sanitized before filesystem operations
10. Sanitize lot/contract/productId before using in filenames or DB queries

## Key Commands
- `npm run sync` — weekly sync (preserves docs + users)
- `npm run seed` — destructive fresh install only
- `npm run import-excel -- <path>` — ERP Excel import
- `npm run dev` — dev server port 3000

## If Something Breaks
Read `.claude/failure-recovery.md` — covers test failures, type errors, build failures, sync breakage, partial implementations, and review rework. Decision tree at the bottom.

## Agent Docs
For detailed workflows, load the relevant file from `agent_docs/`:
- weekly-sync.md, documents.md, coa-data.md, discount.md
- agent-tdpaib.md, email-marketing.md, document-requests.md
- db-schema.md, public-pages.md

## Batch Execution
- Current batch queue is in CLAUDE.md under "Batch Queue"
- Batch documents in `docs/batches/`
- Full lifecycle: `/plan-batch` → implement → `/retro` (same session, before compaction) → `/review-correctness`, `/review-security`, `/review-integration` (fresh sessions) → `/refactor` → `/close-batch`
- If stuck or out of context: run `/handoff`
