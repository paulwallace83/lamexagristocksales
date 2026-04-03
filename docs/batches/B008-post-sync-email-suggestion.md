# B008 — Post-Sync Email Suggestion

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Small (< 1 hr)

---

## Depends On
- B006 (must be merged first) — `apply_sync` tool that returns new arrivals in its result

---

## Goal

After a successful sync, the agent automatically checks for new arrivals and suggests sending a marketing email — with a direct link to the email composer. The user can dismiss the suggestion or clear the new-arrival flags if they don't want to send. This closes the loop on the weekly operational workflow: sync inventory, then notify buyers of new stock.

---

## Background

`apply_sync` (B006) returns `SyncApplyResult.newArrivals: string[]` — the product IDs flagged as new arrivals during this sync. The sync script already calls `setNewArrivals()` from `lib/product-flags.ts` which writes `new_arrival` flags to the `product_flags` table.

The email composer at `/admin/email` already reads these flags and shows "New" badges on the relevant products. The agent just needs to tell the user about it and offer a link.

Additionally, the user wants the ability to clear the new-arrival queue (dismiss the suggestion) without navigating to `/admin/email`. This prevents unwanted emails from being sent if the new arrivals are not ready for marketing.

---

## Scope

### In scope
- New agent tool `get_new_arrivals` — returns current `new_arrival` flags from `product_flags` table with product names
- New agent tool `clear_new_arrivals` — clears all `new_arrival` flags (action tool, requires confirmation)
- System prompt update: after `apply_sync` succeeds and returns new arrivals, the agent should suggest sending a marketing email with a link to `/admin/email`, and offer to clear the flags if the user doesn't want to send
- Agent presents the new arrivals list with product names, not just IDs

### Out of scope
- Sending the email from the agent (user navigates to `/admin/email` to compose and send)
- Modifying the email composer UI
- Auto-scheduling emails
- Featured flag management from the agent

---

## Acceptance Criteria

1. `get_new_arrivals` tool returns `{ arrivals: [{ productId, productName, flaggedAt }], count }` from the `product_flags` table joined with `products`.
2. `get_new_arrivals` returns `{ arrivals: [], count: 0 }` when no new arrivals exist.
3. `clear_new_arrivals` removes all `new_arrival` flags from `product_flags` and returns `{ success: true, cleared: <count> }`.
4. `clear_new_arrivals` requires user confirmation before execution.
5. `clear_new_arrivals` returns `{ success: true, cleared: 0 }` if there are no flags to clear (no-op, not an error).
6. System prompt instructs the agent: after a successful `apply_sync` that includes new arrivals, present the list and suggest: "You can send a marketing email highlighting these new arrivals at /admin/email, or I can clear the new-arrival flags if you'd prefer not to send."
7. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/agent-tools.ts` | Add 2 tool definitions (`get_new_arrivals`, `clear_new_arrivals`). Add 2 execution cases. Import `getFlags`, `clearFlags` from `lib/product-flags.ts`. |
| `app/api/agent/chat/route.ts` | Extend system prompt: add `clear_new_arrivals` to confirmation-required list. Add post-sync email suggestion workflow. |
| `tests/agent-sync-tools.test.ts` | Extend — test both tools with mocked DB. |

**Do not modify:**
- `lib/product-flags.ts` — `getFlags("new_arrival")` and `clearFlags("new_arrival")` already exist and do exactly what we need
- `/admin/email/` — email composer unchanged
- `lib/email-template.ts`, `lib/email-send.ts` — untouched

---

## Test Plan

Extend `tests/agent-sync-tools.test.ts`:

- **get_new_arrivals — with flags:** Mock `getDb()` to return rows with `product_id`, `flag`, `set_at`. Verify tool returns array with `productId`, `productName`, `flaggedAt`.
- **get_new_arrivals — empty:** Mock `getDb()` to return no rows. Verify returns `{ arrivals: [], count: 0 }`.
- **clear_new_arrivals — with flags:** Mock `getDb().prepare().run()` to return `{ changes: 3 }`. Verify returns `{ success: true, cleared: 3 }`.
- **clear_new_arrivals — no flags:** Mock run to return `{ changes: 0 }`. Verify returns `{ success: true, cleared: 0 }`.

Bootstrap:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
```

---

## Notes

- This batch is intentionally small. The heavy lifting (flag management, email rendering) already exists. The agent just needs the tools to query and clear flags, plus system prompt guidance on when to suggest sending.
- `get_new_arrivals` joins `product_flags` with `products` to return human-readable product names. If a flagged product no longer exists (removed during sync), it's excluded from the result.
- The link to `/admin/email` is a plain text suggestion in the agent's response, not a clickable UI element. The agent chat renders markdown, so the agent can format it as a link: `[Open Email Composer](/admin/email)`.
- `clear_new_arrivals` uses `clearFlags("new_arrival")` which is already idempotent — safe to call even if no flags exist.

---

## Definition of Done

- [ ] `get_new_arrivals` tool returns flagged products with names
- [ ] `clear_new_arrivals` tool clears flags with confirmation
- [ ] System prompt guides agent to suggest email after sync
- [ ] Agent offers to clear flags as alternative to sending
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
