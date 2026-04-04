# Deferred Findings — Batch B005

| # | Source | Severity | File | Finding | Reason Deferred | Target Batch | Status |
|---|--------|----------|------|---------|----------------|-------------|--------|
| 1 | security | Important | lib/agent-tools.ts:886-904 | No content validation on `save_proposed_inventory` products array — AI model could include customer names or arbitrary JSON | Tool intentionally accepts flexible schema; customer name stripping enforced by system prompt + `computeDiff` warning; auth-gated surface only | TBD | OPEN |
| 2 | integration | Important | lib/agent-tools.ts:325-352 | TOOL_DEFINITIONS array mixes read/action tools in trailing block | Pre-existing inconsistency not introduced by B005; `executeTool` switch is correctly organized | TBD | OPEN |
| 3 | integration | Minor | tests/agent-sync-tools.test.ts | Global `vi.mock("fs")` replaces fs for entire file — latent risk for future test additions | No current bug; refactoring mock scope is out of scope for B005 | TBD | OPEN |
| 4 | security | Minor | app/api/agent/chat/route.ts:50-58 | Customer name stripping relies solely on system prompt rule 14b — no server-side enforcement | Server-side field stripping requires knowing customer name field locations which vary per ERP format; prompt control appropriate for auth-gated admin surface | TBD | OPEN |
| 5 | security | Minor | lib/agent-tools.ts:644,655,895 | Hardcoded `process.cwd()` for data directory paths | Matches existing pattern (`get_import_review`); LESSONS.md warning is about generator functions, not reader tools | TBD | OPEN |
