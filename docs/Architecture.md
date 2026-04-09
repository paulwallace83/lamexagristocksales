# Architecture — Lamex Agri Stock Sales

**Scope:** System topology, technology decisions, data flow, storage, auth, integrations, and constraints. For business context see `docs/project-brief.md`. For implementation rules see `CLAUDE.md`. For database schema see `agent_docs/db-schema.md`.

---

## System Topology

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Client)                                           │
│  React client components — InventoryTable, AgentChat,       │
│  MarkdownMessage, filter UI, upload forms                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS / fetch / SSE (streaming)
┌─────────────────────▼───────────────────────────────────────┐
│  Next.js 16 App Router (Node.js, Railway)                   │
│  ├── Server Components  — page.tsx, layout.tsx              │
│  ├── Route Handlers     — app/api/**/route.ts               │
│  └── CLI Scripts        — scripts/*.ts (local / prod API)   │
└──────┬───────────────────────┬──────────────────────────────┘
       │                       │
  ┌────▼────┐          ┌───────▼──────────────────────────────┐
  │ SQLite  │          │  Railway Persistent Volume            │
  │lamex.db │          │  $RAILWAY_VOLUME_PATH/               │
  │ (WAL)   │          │  ├── lamex.db                        │
  └────┬────┘          │  ├── uploads/{productId}/...         │
       │               │  └── .agent-uploads/{userHash}/      │
       │               └──────────────────────────────────────┘
       │
  ┌────▼────────────────────────────────────────────────────┐
  │  External APIs                                          │
  │  ├── Anthropic API (claude-haiku-4-5, claude-sonnet-*)  │
  │  └── Resend API (transactional + marketing email)       │
  └─────────────────────────────────────────────────────────┘
```

**Surface to role mapping:**

| Surface | Route | Auth | Role |
|---------|-------|------|------|
| Public inventory | `/`, `/product/[id]` | None | — |
| Public enquiry form | `/contact` | None | — |
| QA document portal | `/qa` | Yes | `qa` or `reviewer` |
| Import review | `/review` | Yes | `reviewer` |
| AI assistant (TDPAIB) | `/admin/agent` | Yes | `qa` or `reviewer` |
| Email composer | `/admin/email` | Yes | `reviewer` |
| Document request queue | `/admin/requests` | Yes | `reviewer` |
| Discount lot picker | `/admin/discount` | Yes | `reviewer` |
| Admin utilities | `/admin/tools` | Yes | `reviewer` |

---

## Technology Choices

| Technology | Why chosen | What was rejected |
|------------|-----------|-------------------|
| **Next.js 16 App Router** | Server components eliminate a separate API layer for read-heavy pages; SSE streaming for agent chat; single deployment unit. | Pages Router (no RSC) |
| **TypeScript** | Shared types (`Product`, `Listing`, `Lot`) enforced across server/client boundary; catches field-name mismatches at build time. | JS only |
| **SQLite + better-sqlite3** | Synchronous API safe with RSC render model; zero connection pool; single file for backups; no network round-trip. | Postgres, PlanetScale, Turso — all require async drivers or separate services |
| **Railway** | Persistent volume for SQLite + uploads on same host; deploy from GitHub; no container orchestration overhead. | Vercel (no persistent FS), Fly.io |
| **NextAuth.js v5** | Credentials + bcrypt; JWT strategy embeds role so no DB hit per request; 8-hour session. | Custom session, Auth0/Clerk (SaaS overhead for internal tool) |
| **Resend** | React email template support; 50-recipient batching; 40 MB attachment limit; simple REST. | SendGrid, SES |
| **Anthropic Claude** | Vision API for PDF/image COA extraction (Haiku); tool-use API for agentic workflows (TDPAIB); prompt caching reduces cost. | OpenAI GPT-4o, Gemini |
| **Vitest** | Native TypeScript; `server.deps.external` handles `.node` binaries; no babel transform required. | Jest |
| **Tailwind CSS v4** | Utility-first; no runtime CSS; co-located with JSX. | CSS Modules, styled-components |

---

## Data Flow: Weekly Sync Pipeline

**Source of truth hierarchy:**

```
ERP (Excel pivot table / CSV export)
  → scripts/import-excel.ts       ←  CLI path
  → import_inventory_file tool     ←  Agent path (file upload in /admin/agent)
  Both produce:                   →  data/inventory-proposed.json
                                     data/import-review.json
  → diff review + approval        →  human sign-off
  → scripts/sync-inventory.ts     →  data/inventory.json (overwritten)
     (delegates to lib/sync-apply.ts applySync())
                                  data/snapshots/inventory-YYYY-MM-DD.json
  → applySync() seed txn     →  SQLite: products/listings/lots wiped + re-inserted
  → relinkDocumentLots()     →  document_lots rows re-created by lot number
  → relinkCoaData()          →  coa_data.lot_id updated by lot number
  → deductDiscountLots()     →  discount lots removed from regular inventory
  → reconciliationReport()   →  per-product qty/weight cross-check
```

**Step-by-step:**

| Step | Script / function | Outputs | Preserves across sync |
|------|------------------|---------|----------------------|
| 1. Import Excel | `scripts/import-excel.ts` (CLI) or `import_inventory_file` agent tool (file upload) | `inventory-proposed.json`, `import-review.json` | — |
| 2. Compute diff | `lib/sync.ts computeDiff()` | `SyncDiff` markdown report | — |
| 3. Validate rules | `lib/sync.ts validateBusinessRules()` | Blocking/non-blocking warnings array | — |
| 4. Human approval | Manual / `/review` portal | Go / no-go | — |
| 5. Snapshot + overwrite | `lib/sync-apply.ts applySync()` (CLI: `scripts/sync-inventory.ts`) | `inventory.json`, dated snapshot | Snapshot only |
| 6. Re-seed SQLite | `lib/sync-apply.ts applySync()` seed transaction | All inventory tables re-inserted (incl. lots) | `documents`, `users`, `discount_items`, `product_flags`, `conversations`, `api_usage`, `document_requests` |
| 7. Re-link documents | `lib/documents.ts relinkDocumentLots()` | `document_lots` rows re-created | — |
| 8. Re-link COA data | `lib/coa-data.ts relinkCoaData()` | `coa_data.lot_id` updated | — |
| 9. Deduct discounts | `lib/discount.ts deductDiscountLots()` | Active discount lots removed from `lots`, `lot_contracts`, `document_lots` | `discount_items` |
| 10. Reconciliation | `lib/sync.ts reconciliationReport()` | Per-product qty/weight table | — |

> **Key invariant:** Lot IDs change on every sync — the entire inventory is dropped and re-inserted. Lot numbers (supplier strings like `25AJCA207B`) are the only stable cross-sync key. Every system that must survive sync (documents, COA data, discount deduction) stores lot numbers, not lot IDs.

---

## Storage Architecture

**Two layers on the same Railway volume:**

| Layer | Local path | Railway path | Contents |
|-------|-----------|-------------|----------|
| SQLite database | `{cwd}/lamex.db` | `$RAILWAY_VOLUME_PATH/lamex.db` | All runtime data |
| File uploads | `{cwd}/public/uploads/` | `$RAILWAY_VOLUME_PATH/uploads/` | COAs, test results, specs, labels, photos |
| Agent staging | `{cwd}/.agent-uploads/` | `$RAILWAY_VOLUME_PATH/.agent-uploads/` | Per-user temp files (30-min TTL) |

**Path resolution:** `lib/paths.ts getDataDir()` checks `RAILWAY_VOLUME_PATH` + `existsSync()`. Falls back to `process.cwd()` locally and during build (volume not mounted at build time — do not read from the volume at build time).

**First-deploy bootstrap:** On first access, `getDb()` detects an empty `products` table and runs `autoSeed()`. `copyUploadsToVolume()` copies `public/uploads/` from the build image to the volume once. After first deploy, all weekly syncs use `lib/sync-apply.ts applySync()` (called from CLI or future route handlers) — `autoSeed()` does not re-run once products exist.

**Upload directory structure:**

```
uploads/
  {productId}/
    coa/                       ← product-level fallback only
    lots/
      {lotNumber}/
        coa/
        test-results/
    contracts/
      {baseContract}/
        specs/
        labels/
        photos/
```

**Why not S3 or a cloud database:** Single-node Railway deployment removes the need for distributed storage. SQLite WAL mode handles concurrent reads from server components safely. Files are served via `app/api/files/` which reads directly from the volume — no CDN needed at this traffic volume. Adding S3/Postgres would require connection pool management, IAM credentials, network latency, and removes the zero-ops advantage that makes solo maintenance viable.

---

## Authentication Model

**Provider:** NextAuth.js v5, Credentials provider, JWT session strategy, 8-hour session lifetime.

**Auth flow:**
1. User POSTs credentials to `/api/auth/callback/credentials`
2. `lib/auth.ts authorize()` queries `users` table, bcrypt-compares password
3. On success: `{ id, email, name, role }` → JWT `jwt()` callback embeds `role`
4. `session()` callback surfaces `role` on `session.user`
5. `/api/auth/redirect` reads role → redirects `qa` to `/qa`, `reviewer` to `/review`

**Route protection:** Server-side `await auth()` check in each section's `layout.tsx`. Redirects to `/qa/login` on failure. No Next.js middleware is used.

**Role capabilities:**

| Role | Login | Redirect | Can do |
|------|-------|----------|--------|
| `qa` | `/qa/login` | `/qa` | Upload documents, use TDPAIB agent |
| `reviewer` | `/qa/login` | `/review` | All `qa` + import review, admin tools, email, discount, requests |

**No public session:** The public inventory and enquiry form are unauthenticated. The enquiry form is rate-limited by two parallel mechanisms: an in-memory per-process limiter (`lib/enquiry-rate-limit.ts`, 5/email/hour, returns structured 429 with `retryAfter`) for every enquiry, and a DB-backed per-email limiter (`getRecentRequestCount` in `lib/document-requests.ts`, also 5/hour) when document requests are attached. The DB limiter is the only cross-instance backstop on multi-instance deployments.

---

## External Integrations

| Integration | Auth | Used for | Failure behaviour |
|-------------|------|---------|-------------------|
| Anthropic — Haiku (`claude-haiku-4-5-20251001`) | `ANTHROPIC_API_KEY` | COA parameter extraction on upload (`lib/coa-extract.ts`) | Fire-and-forget after HTTP response. Failure returns `null`; QA can backfill later via `/admin/tools`. |
| Anthropic — Claude (`claude-sonnet-*`) | `ANTHROPIC_API_KEY` | TDPAIB agent chat with tool use (`app/api/agent/chat/route.ts`) | Error returned to client; `api_usage` row not written on failure. |
| Resend | `RESEND_API_KEY` | Marketing emails, document delivery, document request notifications | Synchronous — error surfaced immediately to admin UI. |

**COA extraction:** Accepts PDF (`document` content block) and images (`image` content block). Max 1024 output tokens. Returns flat JSON of measurable parameters. Runs after the upload HTTP response is sent — fully async, non-blocking.

**TDPAIB agent:** Multi-turn conversation with full tool use. Tools defined in `lib/agent-tools.ts`. Max 10 iteration loop per request. SSE stream delivers assistant text in real time. Per-request token cost (including cache creation/read tokens) recorded to `api_usage`. Confirmation required before any data-modifying tool executes.

**Resend batching:** 50 recipients per API call. Marketing sends split into groups of 50. Attachment sends enforce 40 MB total limit before the API call.

---

## Key Architectural Boundaries

**What runs where:**

| Layer | Examples | SQLite access | Filesystem access |
|-------|---------|--------------|------------------|
| Server Component | `app/page.tsx`, `app/product/[id]/page.tsx`, `app/qa/**/page.tsx` | Yes (sync) | Via lib functions |
| Route Handler | `app/api/upload/route.ts`, `app/api/agent/chat/route.ts`, `app/api/files/[...path]/route.ts` | Yes | Yes |
| Client Component | `InventoryTable.tsx`, `AgentChat.tsx`, `MarkdownMessage.tsx` | No | No |
| CLI Scripts | `scripts/sync-inventory.ts`, `scripts/import-excel.ts`, `scripts/seed.ts` | Yes (direct) | Yes (direct) |
| `lib/` modules | All files under `lib/` | Yes (server-side only) | Yes (server-side only) |

**Critical boundaries:**

- `better-sqlite3` is in `serverExternalPackages` in `next.config.ts`. Never import from a client component.
- Uploaded files on the Railway volume are not under `public/` (build-image path). Always serve via `app/api/files/[...path]/route.ts`, which reads from `getUploadsRoot()` and applies path traversal guards before streaming. This indirection is non-negotiable in production.
- `RAILWAY_VOLUME_PATH` is not set at build time. Never read from the volume in `next.config.ts` or any build-time path.

---

## Non-Negotiable Constraints

| Constraint | Why it cannot change without major migration |
|------------|---------------------------------------------|
| **Lot numbers as the stable cross-sync key** | `documents.lot_numbers` JSON, `coa_data` re-linking, and discount deduction all depend on lot number strings surviving a full sync cycle. Switching to any auto-increment key would orphan documents on the first sync. |
| **SQLite on Railway persistent volume** | The database and uploaded files must co-exist on the same volume. Splitting them requires rewriting `lib/paths.ts`, all file serving, and the auto-seed bootstrapping logic. |
| **Volume not available at build time** | `getDataDir()` guards against this. All volume reads must be in runtime contexts (server component render, route handler, CLI script). |
| **Sync is a full re-seed** | The re-linking machinery is the compensating mechanism. Moving to incremental diff-based sync requires a completely different sync script, FK cascade handling, and orphan-document detection. |
| **COA extraction is fire-and-forget** | The upload API responds before extraction completes. Do not assume COA data is available immediately after upload — check `coa_data` separately. |
| **`next lint` not available** | Next.js 16 removed the lint command. CI uses `tsc --noEmit`. Do not add `next lint` to any script or workflow. |

---

## What Would Be Hardest to Change

**1. Swapping SQLite for a network database**

`better-sqlite3` is synchronous. Every query in `lib/db.ts`, `lib/inventory-db.ts`, `lib/documents.ts`, `lib/discount.ts`, `lib/agent-db.ts`, `lib/api-usage.ts`, `lib/conversations.ts`, `lib/coa-data.ts`, `lib/document-requests.ts`, and all route handlers that call them would need to be converted to async/await. This cascades into every server component that currently calls `getDb()` at the top of its render function. The auto-seed and migration logic would also need to be restructured for async initialization.

**2. Changing the weekly sync model**

The current model is a full drop-and-re-insert. The re-linking machinery (`relinkDocumentLots`, `relinkCoaData`) is the compensating mechanism for lot ID instability. Moving to incremental sync (UPDATE/INSERT/DELETE individual rows) eliminates re-linking complexity but requires detecting which lots were added, changed, or removed; handling FK cascades correctly; and deciding what to do with documents attached to removed lots.

**3. Moving uploaded files out of the local filesystem**

The upload directory structure mirrors the document taxonomy. Every file serve goes through `app/api/files/` which resolves paths via `getUploadsRoot()`. Moving to S3 or another object store requires replacing `getUploadsRoot()`, rewriting `getUploadDir()`, `getDocumentUrl()`, the files route handler, the agent temp file staging, and the first-deploy copy bootstrapping.

---

## Known Architectural Debt and Limitations

| Item | Description | Impact |
|------|-------------|--------|
| No migration framework | Schema changes are ad-hoc `PRAGMA table_info` checks in `lib/db.ts migrate()`. No versioned migration history. | Low now; grows as schema evolves. |
| Single-node SQLite writes | WAL handles concurrent reads; writes are serialized. Acceptable at current user count. | Low at current scale. |
| `users.json` flat file | User credentials seeded from `data/users.json` (gitignored). No admin UI for user management. Adding a user requires manual edit + `npm run seed`. | Operational inconvenience only. |
| No job queue for AI calls | COA extraction and TDPAIB chat make synchronous Anthropic API calls from route handlers. Slow model responses can approach Railway's 30-second request timeout on chat. | Chat only; extraction is non-blocking. |
| `api-pricing.json` manually refreshed | Token costs calculated from `data/api-pricing.json`. If not refreshed after Anthropic pricing changes, `api_usage.cost_usd` values are stale. | Monitoring accuracy only. |
| Old-format upload filenames | Files uploaded before the descriptive naming convention use a unix timestamp prefix. Both formats must be supported until migration is complete via `npm run rename-uploads`. | Display logic must handle both. |
| No scheduled jobs | Discount deduction, COA backfill, and rename operations are manual scripts or admin-triggered API endpoints. No cron or background scheduler. | Operational only. |
| `unsafe-inline` in CSP | Tailwind + Next.js inline styles require `unsafe-inline`. A nonce-based CSP is not implemented. | Accepted risk for internal admin tool. |
