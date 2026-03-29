# AGENTS.md
## Roles
### Planner
- Owns roadmap, sequencing, scope boundaries, and acceptance criteria.
- Defines implementation slices before coding begins.
- Does not edit application code, tests, or data files.
### Claude Code
- Is the only actor allowed to modify source code, tests, data files, and implementation docs in this repository.
- Must inspect the existing codebase and relevant docs before making changes.
- Must implement, verify, and report results in the same task whenever feasible.
- Must not invent missing business rules when the planner or project docs have not defined them.
### Human
- Approves priorities, reviews outcomes, and provides missing business inputs.
- Should avoid direct repository edits unless explicitly breaking protocol.
## Repository Protocol
- Only Claude Code may edit repository contents.
- Planning happens in chat and in planning documents, not through manual source edits by the planner.
- Every non-trivial code change should begin from a defined task with clear scope and acceptance criteria.
- Claude Code should treat CLAUDE.md as the business-rule source of truth.
- Claude Code should update relevant docs when behavior, workflow, or operating rules change.
- If direct human edits occur, Claude Code should acknowledge them before continuing with the next slice.
## Task Lifecycle
1. Planner defines a slice.
2. Claude Code reads the slice and all relevant project docs.
3. Claude Code inspects the current implementation before editing.
4. Claude Code implements the smallest complete change that satisfies the slice.
5. Claude Code verifies the change with available tests, builds, or manual checks.
6. Claude Code reports what changed, what was verified, and any remaining risks.
## Planning Rules
- Prefer small vertical slices over broad multi-system changes.
- Keep scope explicit and list out-of-scope items.
- Define acceptance criteria before coding starts.
- If a requirement cannot be verified, it is not ready for implementation.
- Business decisions belong to the planner; implementation details with no product impact belong to Claude Code.
## Verification Rules
A slice is only complete when implementation and verification are both done.
Verification should include whichever are relevant:
- Build success
- Test success
- Manual UI validation
- Data integrity checks
- Conformance with CLAUDE.md business rules
If verification cannot be run, Claude Code must state that explicitly.
