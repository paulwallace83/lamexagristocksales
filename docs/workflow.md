# Workflow
This document defines the working protocol for the Lamex Agri Stock Sales application.
## Operating Model
The repository uses a two-role model:
- Planner: owns roadmap, priorities, scope, acceptance criteria, and release sequencing.
- Claude Code: the sole implementation agent and the only actor that edits the codebase.
This separation keeps product decisions explicit and implementation changes controlled.
## Source Of Truth
Use these files consistently:
- CLAUDE.md: master instruction file — business rules, inventory rules, QA portal rules, sync workflow, publishing constraints, and agent operating protocol.
- docs/roadmap.md: prioritized upcoming work.
- CHANGELOG.md: released changes only.
- secrets.md: credentials and secrets (gitignored, never committed).
- .env.local: environment variables including AUTH_SECRET (gitignored, never committed).

### Inventory Data Files
- data/inventory.json: authoritative inventory state — products, listings, contracts. Updated via weekly sync.
- data/suppliers.json: authoritative supplier master — name, COO, trading company flag. Edit this to add suppliers.
- data/warehouses.json: authoritative warehouse master — name, city, state, storage type. Edit this to add warehouses.
- data/discount-inventory.json: discount/clearance items — persists independently from weekly sync. Updated via admin UI or Claude chat.
- data/snapshots/: timestamped copies of inventory.json from before each sync (gitignored).

### Sync Scripts
- lib/sync.ts: diff engine — computes changes between current and proposed inventory. Pure functions, no side effects.
- scripts/sync-inventory.ts: apply script — snapshots, overwrites, re-seeds SQLite (preserving docs + users), regenerates markdown references.
- scripts/seed.ts: full destructive seed — for fresh installs only. Clears everything including documents and users.
## Weekly Inventory Sync Procedure
Each week, the user provides raw pivot table data. Claude processes it through this sequence:
1. User pastes raw pivot table data in chat.
2. Claude parses it into structured inventory (resolving COO from suppliers.json, city/state from warehouses.json, stripping customer names from Row 3).
3. Claude writes the parsed data to data/inventory-proposed.json.
4. Claude runs computeDiff() from lib/sync.ts to compare proposed vs current data/inventory.json.
5. Claude presents the diff report: additions, removals, quantity changes, new suppliers/warehouses, and any blocking warnings.
6. User reviews and approves (or requests corrections).
7. Claude runs `npm run sync` which: snapshots current state, overwrites inventory.json, re-seeds SQLite (preserving documents + users), deducts active discount lots from regular inventory, validates remaining discount items, regenerates suppliers.md and warehouses.md.
8. Claude presents a reconciliation report (per-product totals) for the user to cross-check against the raw data.
9. User signs off on reconciliation. Sync is complete.

If new suppliers are found, Claude asks the user for COO before proceeding. If new warehouses are found without city/state, Claude asks for location details. These are added to suppliers.json and warehouses.json before the sync runs.

Rollback: copy any snapshot from data/snapshots/ back to data/inventory.json and run `npm run seed`.

## Delivery Flow

Every batch follows a 7-step lifecycle with dedicated skills for each phase. Steps are sequential — each depends on the output of the previous step.

```
/plan-batch → implement → /retro → /review-* → /refactor → /close-batch
    1              2          3         4            5           6
```

### Step 1: Plan (`/plan-batch`)
**Who:** Claude Code (implementing agent)
**Input:** Batch document from `docs/batches/`
**Process:**
1. Research: read `CLAUDE.md`, `LESSONS.md`, batch doc, referenced files, relevant `agent_docs/`
2. Report understanding, flag ambiguities, wait for user confirmation
3. Create step-by-step implementation plan with risk assessment
4. Convert plan into testable requirements checklist → `docs/batches/{batch-id}-requirements.md`
5. Wait for user approval before implementing

**Gate:** User approves the plan. Creates feature branch `batch/{batch-id}`.

### Step 2: Implement
**Who:** Claude Code (implementing agent)
**Process:**
1. Implement the smallest complete solution following the approved plan
2. Run `npm test` and `npx tsc --noEmit` — both must pass
3. Verify acceptance criteria from the batch document

**Gate:** Tests pass, types clean, acceptance criteria met.

### Step 3: Retro (`/retro`)
**Who:** Claude Code (implementing agent — same session, BEFORE context compaction)
**Process:**
1. Self-review every file touched: confidence rating, uncertainties, shortcuts, edge cases
2. Lamex-specific checks: sync survival, data privacy, client/server boundary, path safety
3. Flag anything rated below 7 for immediate attention
4. Save to `docs/reviews/{batch-id}-retro.md`

**Gate:** All items rated below 7 are flagged.

### Step 4: Review (`/review-correctness`, `/review-security`, `/review-integration`)
**Who:** Fresh agent sessions (NOT the implementing agent)
**Process:** Three independent reviews, each saving to `docs/reviews/`:
- **Correctness** (`{batch-id}-correctness.md`): bugs, logic errors, unhandled edge cases, AC deviations
- **Security** (`{batch-id}-security.md`): injection, auth gaps, data exposure, path traversal, file upload validation
- **Integration** (`{batch-id}-integration.md`): pattern consistency, duplication, naming, sync survival, test coverage, doc accuracy

Each review classifies findings as Critical / Important / Minor.

**Gate:** All three review files exist in `docs/reviews/`.

### Step 5: Refactor (`/refactor`)
**Who:** Claude Code (can be implementing agent or fresh session)
**Process:**
1. Read all four review files (retro + 3 reviews)
2. Fix all Critical findings immediately (show before/after)
3. Fix or defer Important findings (deferred items → `docs/reviews/{batch-id}-deferred.md` + TODO in code)
4. Fix or TODO Minor findings
5. Run `npm test` and `npx tsc --noEmit` — both must pass
6. Confirm every finding addressed

**Gate:** Zero unresolved Critical findings. Tests pass.

### Step 6: Close (`/close-batch`)
**Who:** Claude Code
**Process:**
1. Final test run (`npm test` + `npx tsc --noEmit`)
2. Update documentation: `CLAUDE.md`, `docs/roadmap.md`, `docs/Architecture.md`, `LESSONS.md`, `docs/epics.md`
3. Check for doc drift — no contradictions between docs and implementation
4. Clean up: resolve batch-specific TODOs, verify deferred doc exists if needed
5. Print summary: what was built, docs updated, deferred items, next batch context

**Gate:** Tests pass, docs accurate, no Critical findings open.

### Step 7: Merge & Release
**Who:** Paul (planner)
**Process:** Review summary, merge feature branch, tag release if applicable.

### Emergency: Handoff (`/handoff`)
If a batch is abandoned mid-way (context exhaustion, blocker, need to stop), run `/handoff` to capture session state. See `.claude/failure-recovery.md` for the full decision tree.
## Slice Standards
Every slice should be small enough to complete and verify in one focused pass.
Use slices when work affects any of the following:
- UI behavior
- data shape or validation
- QA portal behavior
- inventory publishing workflow
- authentication, uploads, or storage behavior
- release process or operating docs
Prefer vertical slices such as "Add missing-document warning to QA dashboard" over broad technical slices such as "Refactor document system".
## Definition Of Ready
A slice is ready for implementation when it includes:
- a clear user or operational outcome
- explicit scope
- explicit out-of-scope items
- relevant business constraints from CLAUDE.md
- concrete acceptance criteria
- concrete verification steps
If business inputs are missing, the planner should supply them before implementation starts.
## Definition Of Done
A slice is done only when:
- implementation is complete
- required verification has been run, or the inability to run it has been stated clearly
- the documentation checklist below has been completed
- no known violation of CLAUDE.md rules remains inside the implemented scope

### Documentation Checklist
After every completed slice, Claude Code must verify each applicable item before reporting done. Skip items marked N/A with a brief reason.

| # | Document | Check | Applies When |
|---|----------|-------|-------------|
| 1 | **CLAUDE.md** | Feature spec, tool counts, key files list, architecture section, capability descriptions | Any feature, tool, workflow, or API change |
| 2 | **CHANGELOG.md** | New version entry with Added/Fixed/Changed sections | Every release |
| 3 | **docs/roadmap.md** | Move slice from candidate → completed section; update active priorities | Every slice |
| 4 | **docs/user-guide.md** | User-facing workflow, "What You Can Do" table, file upload section, admin reference tables | Any change visible to QA/reviewer/admin users |
| 5 | **Agent system prompt** | Tool list in rule 1 (confirmation), batch rules, matching rules, new capabilities | Any agent tool or behavior change |
| 6 | **docs/workflow.md** | Source of truth list, sync procedure, delivery flow | Process or protocol changes |
| 7 | **docs/epics.md** | Epic status and upcoming work scope | Any batch that completes or changes an epic |

**Cross-check step:** After updating docs, check for stale references:
- `grep -r "AGENTS.md" *.md docs/*.md` — should return zero results
- Check that `CLAUDE.md` "Batch Queue" table reflects current batch status
- Check that `CLAUDE.md` key files sections reference any new or renamed files
- Check that all action tools appear in the agent system prompt confirmation list (if agent tools changed)
## Decision Boundaries
Use this rule to resolve ambiguity:
- Product, workflow, and data-policy decisions belong to the planner.
- Implementation details with no business impact belong to Claude Code.
- Compliance, confidentiality, and published inventory-data decisions should be made explicit by the planner before coding.
## Release States
Track work using these states:
- Planned
- In Progress
- Implemented
- Verified
- Accepted
- Released
Only released work should appear in CHANGELOG.md.
