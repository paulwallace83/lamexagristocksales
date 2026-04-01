# BXXX — [Short Title]

**Epic:** E? — [Epic Name]
**Status:** `draft` | `ready` | `in-progress` | `done` | `blocked`
**Estimated size:** Small (< 1 hr) | Medium (2–3 hrs) | Large (3–5 hrs)

---

## Goal

One paragraph: what changes and why. State the user-visible or operational outcome, not the implementation detail.

---

## Background

Brief context an executing agent needs. Reference existing functions, line numbers, types, or doc sections. Keep it tight — if the agent needs more context, point them to a file to read, don't paste it here.

---

## Scope

### In scope
- Bullet list of what this batch delivers

### Out of scope
- What is explicitly excluded (and where it lives instead, if known)

---

## Acceptance Criteria

Numbered list. Each criterion is independently testable. Use concrete values where possible ("returns a warning with `requiresAction: false`"), not vague language ("handles errors gracefully").

1. ...
2. ...

---

## Files to Touch

| File | Change |
|------|--------|
| `path/to/file.ts` | What changes in this file |

**Do not modify:** List any files the agent should leave alone and why.

---

## Test Plan

Describe the test file(s) to create or extend. Include a bootstrap snippet if the test requires non-obvious mocking or fixtures.

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
- [ ] Documentation Checklist complete — see `docs/workflow.md` (CLAUDE.md, roadmap.md, Architecture.md, LESSONS.md, epics.md as applicable)
