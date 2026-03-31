# /review-integration — Integration Review

## Context
Read the batch document specified by the user (e.g., `docs/batches/B001-sync-data-quality.md`). If no batch is specified, check CLAUDE.md "Batch Queue" for the batch currently marked `in-progress`.

## Description
Run by a FRESH agent after implementation is complete. This agent reviews how the new code fits into the broader codebase and whether it sets up future batches for success or creates problems.

## Setup
- This MUST be a new agent session — never the implementing agent
- Do not read any previous review files — form your own independent assessment
- You MUST read the broader codebase before reviewing — understanding existing patterns is your primary job

## Instructions

Read these files first:
1. `CLAUDE.md` (architecture overview, code conventions, critical rules)
2. `docs/Architecture.md` (system topology, tech decisions, non-negotiable constraints, architectural boundaries)
3. `LESSONS.md` (hard-won patterns — especially sync model, path resolution, testing patterns)
4. The batch document (what was built and its acceptance criteria)
5. `docs/epics.md` (what's coming next — are we setting up future work for success?)

Then read the existing codebase patterns relevant to this batch. At minimum:
- `lib/` modules that the batch touches or is adjacent to
- Existing test files in `tests/` to understand test patterns
- Route handlers in `app/api/` for API pattern consistency
- Server components and client components that follow the same patterns

Then review all files created or modified in this batch.

Focus EXCLUSIVELY on:

### Pattern Consistency
- Does the new code follow the same patterns as existing code?
- Server components call `getDb()` directly; client components fetch via API routes — is this boundary respected?
- Does error handling match the existing pattern (log server-side, generic message to client)?
- Are SQL queries structured consistently with `lib/db.ts` patterns (parameterised, synchronous)?
- Do new `lib/` exports follow the existing module organisation?

### Duplication
- Does this batch rebuild functionality that already exists in `lib/`?
- Are there utility functions (sanitisation, path resolution, date formatting) that should be reused from existing modules?
- Are constants or config values duplicated across files?

### Naming Conventions
- Database columns: `snake_case` in SQLite, `camelCase` in TypeScript types
- File naming: `kebab-case.ts` for lib and route files
- Component naming: `PascalCase.tsx` for React components
- Product IDs: slugified via `generateProductId()` — not manually constructed
- Document filenames: via `generateDocFilename()` — not manually constructed

### Sync Survival
- Will this change survive a weekly sync? (All inventory tables are dropped and re-inserted)
- If new data is stored, does it use lot numbers (stable) or lot IDs (unstable)?
- If a new table is created, is it in the "preserved during sync" list or does it need to be?
- Does `lib/db.ts` need a migration block for any new columns?

### Test Coverage
- Do tests exist for the new functionality?
- Are test patterns consistent with `tests/coa-data.test.ts`, `tests/sync.test.ts`, `tests/documents.test.ts`?
- Is `vi.mock("../lib/db")` used where needed (any module that transitively imports `better-sqlite3`)?
- Are fixtures minimal (`makeProduct()` style) rather than importing real data?

### Doc Accuracy
- Does `CLAUDE.md` still accurately describe the project after this change?
- Does `docs/Architecture.md` match what was actually built?
- Does `LESSONS.md` need a new entry for any non-obvious decision made in this batch?
- Is `docs/epics.md` still accurate, or does this batch change the scope of upcoming work?

Do NOT comment on:
- Individual bugs (that's `/review-correctness`)
- Security vulnerabilities (that's `/review-security`)
- Code style preferences that don't affect consistency

For each finding, provide:
- The file(s) involved
- What the inconsistency or issue is
- What it should look like to be consistent (reference the existing code)
- Why it matters for future batches

## Output
Save findings to `docs/reviews/{batch-id}-integration.md` using this format:

```markdown
# Integration Review — {Batch ID}

**Reviewer:** Fresh agent session
**Date:** {today}
**Batch:** {batch document path}

## Critical (must fix before merge)
- **[file(s)]** — [What's inconsistent/broken]. Conflicts with [existing pattern in file]. Impact on future: [which batches are affected].

## Important (should fix, can be next batch)
- **[file(s)]** — [Issue]. Should match [existing pattern].

## Minor (nice to have)
- **[file(s)]** — [Suggestion].

## Sync Survival Check
- [ ] New data uses lot numbers (not lot IDs) as stable keys
- [ ] New tables/columns added to the "preserved during sync" path (if applicable)
- [ ] Migration block in `lib/db.ts` for any schema changes
- [ ] No assumptions about lot ID stability

## Future Batch Readiness
- **{next batch ID}**: [Ready / Concern — explain]
- **Overall foundation**: [Solid / Needs work — explain]

## Doc Updates Needed
- [ ] CLAUDE.md: [What needs updating, or "No changes needed"]
- [ ] Architecture.md: [What needs updating, or "No changes needed"]
- [ ] LESSONS.md: [New lesson to add, or "No new lessons"]
```

## Rules
- Read the relevant parts of the codebase before starting — you cannot review integration without knowing what exists
- Always check `docs/epics.md` to understand what's coming next
- Every finding must reference both the new code AND the existing code it should be consistent with
- "Looks fine" is not acceptable — verify every pattern explicitly
- You are a reviewer, not a fixer — document findings only, do not modify code
- Always include the Sync Survival Check — this is the single most common source of integration bugs in this project
- Always include the Doc Updates Needed section
