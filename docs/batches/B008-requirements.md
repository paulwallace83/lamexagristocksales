# B008 — Post-Sync Email Suggestion: Requirements

## Tool: `get_new_arrivals`

- [ ] R1: Tool definition added to `TOOL_DEFINITIONS` with no required input params
- [ ] R2: Returns `{ arrivals: [{ productId, productName, flaggedAt }], count }` when new_arrival flags exist
- [ ] R3: Returns `{ arrivals: [], count: 0 }` when no new_arrival flags exist
- [ ] R4: Flagged products that no longer exist in `products` table are excluded (inner join)
- [ ] R5: `flaggedAt` comes from `product_flags.set_at`
- [ ] R6: Tool is read-only — no confirmation required

## Tool: `clear_new_arrivals`

- [ ] R7: Tool definition added to `TOOL_DEFINITIONS` with no required input params
- [ ] R8: Calls `clearFlags("new_arrival")` from `lib/product-flags.ts`
- [ ] R9: Returns `{ success: true, cleared: <count> }` where count is the number of flags deleted
- [ ] R10: Returns `{ success: true, cleared: 0 }` when no flags exist (no-op, not an error)
- [ ] R11: Listed in system prompt confirmation-required tool list (rule 1)

## System Prompt

- [ ] R12: `clear_new_arrivals` added to the confirmation-required tool list in rule 1
- [ ] R13: Capabilities section updated to mention new arrival queries and flag clearing
- [ ] R14: New rule added: after `apply_sync` returns new arrivals, agent presents the list and suggests sending a marketing email via `/admin/email`, or offers to clear the flags

## Tests (`tests/agent-sync-tools.test.ts`)

- [ ] R15: `get_new_arrivals` with flags — returns correct shape with productId, productName, flaggedAt
- [ ] R16: `get_new_arrivals` empty — returns `{ arrivals: [], count: 0 }`
- [ ] R17: `clear_new_arrivals` with flags — returns `{ success: true, cleared: 3 }`
- [ ] R18: `clear_new_arrivals` no flags — returns `{ success: true, cleared: 0 }`

## Validation

- [ ] R19: `npx tsc --noEmit` clean
- [ ] R20: `npm test` passes (all existing + new tests)
- [ ] R21: No unrelated changes introduced
