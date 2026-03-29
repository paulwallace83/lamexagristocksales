# Workflow
This document defines the working protocol for the Lamex Agri Stock Sales application.
## Operating Model
The repository uses a two-role model:
- Planner: owns roadmap, priorities, scope, acceptance criteria, and release sequencing.
- Claude Code: the sole implementation agent and the only actor that edits the codebase.
This separation keeps product decisions explicit and implementation changes controlled.
## Source Of Truth
Use these files consistently:
- AGENTS.md: repository operating protocol for planner and implementation agent behavior.
- CLAUDE.md: business rules, inventory rules, QA portal rules, sync workflow, and publishing constraints.
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
1. Planner defines a task with goal, scope, constraints, acceptance criteria, and verification.
2. Claude Code reviews the task and relevant project docs.
4. Claude Code inspects the current codebase before making changes.
5. Claude Code implements the smallest complete solution.
6. Claude Code verifies the result.
7. Claude Code updates relevant docs when workflow or behavior changes.
8. Claude Code reports the implementation outcome, verification status, and open risks.
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
- relevant documentation has been updated
- no known violation of CLAUDE.md rules remains inside the implemented scope
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
