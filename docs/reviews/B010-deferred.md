# Deferred Findings — Batch B010

| # | Source | Severity | File | Finding | Reason Deferred | Target Batch | Status |
|---|--------|----------|------|---------|----------------|-------------|--------|
| 1 | integration + retro | Important | `app/api/coa-review/route.ts` | POST accepts raw lotIds without verifying lots belong to a specific product — no product-scope on mutations | Low risk (authenticated internal users only), requires API contract change + client update | TBD | OPEN |
| 2 | integration + retro | Important | `lib/agent-tools.ts` | `reviewedBy` uses `agent:${email}` format — inconsistent with other `updatedBy` plain labels | Cosmetic, would need project-wide convention decision | TBD | OPEN |
| 3 | retro + integration | Minor | `lib/documents.ts` | `getDocumentStatus()` fetches ALL coa_data rows unconditionally — at scale should join against lots | Premature optimization at current scale, consistent with existing `getDocuments()` pattern | TBD | OPEN |
| 4 | integration | Minor | `app/api/coa-review/route.ts` | Missing `export const dynamic = "force-dynamic"` — consistent with peer routes but not with majority of API routes | Consistent with closest peer routes; auth makes route inherently dynamic | TBD | OPEN |
