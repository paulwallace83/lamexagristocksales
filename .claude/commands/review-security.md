# /review-security — Security Review

## Context
Read the batch document specified by the user (e.g., `docs/batches/B001-sync-data-quality.md`). If no batch is specified, check CLAUDE.md "Batch Queue" for the batch currently marked `in-progress`.

## Description
Run by a FRESH agent after implementation is complete. This system handles food commodity trade data — customer names and pricing are commercially sensitive, and uploaded documents (COAs, lab reports) are access-controlled.

## Setup
- This MUST be a new agent session — never the implementing agent
- Do not read any previous review files — form your own independent assessment

## Instructions

Read these files first:
1. `CLAUDE.md` (critical rules — especially rules 1, 2, 10 about sensitive data)
2. `.claude/rules/security.md` (path traversal, auth guards, file validation, error handling)
3. `.claude/rules/data-privacy.md` (customer names, pricing, sensitive ERP fields)
4. `LESSONS.md` (past security fixes and patterns)
5. `docs/Architecture.md` (auth model, storage architecture, architectural boundaries)
6. The batch document

Then review ALL files created or modified in this batch.

Focus EXCLUSIVELY on (OWASP Top 10 as framework):

### Injection
- SQL injection via unsanitized input in `better-sqlite3` queries — are all queries parameterised?
- Path traversal in file-serving or file-reading routes — does every path resolve + prefix check against `getUploadsRoot()`?
- JSON.parse on user-supplied or DB-stored strings without try/catch

### Authentication & Authorization
- Missing auth checks on new API routes (`await auth()` or session check)
- Role-level gaps — does a `qa` user gain access to `reviewer`-only functionality?
- Auth bypass via direct API calls (route handler without session guard)
- Per security rules: restricted file categories return **404** (not 403) for unauthorized access

### Data Exposure
- Customer names leaking into any output (API response, HTML, logs, error messages)
- Pricing data exposed outside the discount items context
- Sensitive ERP fields (trader codes, finance columns, internal refs) in any output
- Stack traces, file paths, or internal references in API error responses
- SQLite error messages surfaced to the client

### File Upload & Serving
- File paths constructed from user input without sanitization + resolve + prefix check
- Files served without going through `app/api/files/[...path]/route.ts`
- MIME type validation bypassed (checking extension only, not content type)
- File size limit enforced client-side only (50 MB server-side enforcement required)
- Filenames with `..`, `/`, or `\` not rejected

### Configuration
- Secrets (`AUTH_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) hardcoded or logged
- `.env.local` values exposed in client-side bundles
- `better-sqlite3` imported in a client component (would expose DB path in bundle error)

### Input Validation
- User-controlled values used in file paths, SQL, or redirects without sanitization
- Lot numbers, contract numbers, or product IDs used raw in `path.join()` or filename construction
- Missing validation on API route body/params

Do NOT comment on:
- Code style, formatting, or naming
- Non-security bugs (that's `/review-correctness`)
- Architecture decisions (unless they create a security hole)
- Performance

For each finding, provide:
- The exact file and line (or function name)
- The vulnerability type (from categories above)
- The attack vector — how would this be exploited?
- Severity justification
- Suggested remediation

## Output
Save findings to `docs/reviews/{batch-id}-security.md` using this format:

```markdown
# Security Review — {Batch ID}

**Reviewer:** Fresh agent session
**Date:** {today}
**Batch:** {batch document path}

## Critical (must fix before merge)
- **[file:line]** — **[Vulnerability type]**. Attack vector: [how it's exploited]. Impact: [what an attacker gains]. Fix: [remediation].

## Important (should fix, can be next batch)
- **[file:line]** — **[Vulnerability type]**. [Description]. Fix: [remediation].

## Minor (nice to have)
- **[file:line]** — [Issue]. [Suggestion].

## Security Checklist
- [ ] All new API routes protected by auth check (session + role)
- [ ] No secrets in source code or logs
- [ ] All user input validated before use in SQL queries (parameterised)
- [ ] All user input validated before use in file paths (sanitize + resolve + prefix)
- [ ] No customer names, pricing, or sensitive ERP fields in any output
- [ ] Unauthorized access returns 404 (not 403) for file/document routes
- [ ] File uploads validated server-side (size, MIME type, filename characters)
- [ ] Error responses contain no stack traces, file paths, or internal details
```

## Rules
- If no issues found in a category, write "None found" — do not skip the section
- Always complete the Security Checklist at the bottom
- Think like an attacker — what would you try against this code?
- The public inventory pages have no auth — any data shown there is fully public
- Customer names and pricing are the highest-sensitivity data in this system
- Path traversal is the most common historical vulnerability — check every file operation
- You are a reviewer, not a fixer — document findings only, do not modify code
