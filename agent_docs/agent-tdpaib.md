# AI Assistant — Top Dog Paul's AI Brain (TDPAIB)

An embedded Claude-powered chat interface for QA and operations staff. Branded as "TDPAIB" (hover reveals full name). Accessible at `/admin/agent` — requires `qa` or `reviewer` role. Completely separated from the public customer view.

## Capabilities

- **Document matching:** Upload a COA, spec sheet, label, or product photo → Claude reads the document, extracts lot/contract numbers, proposes matches against inventory, and uploads after explicit user confirmation. Production date passed as `documentDate` so filenames reflect actual document date.
- **Batch document upload:** Drop multiple files (24+) at once → Claude reads all files, extracts lot/contract numbers and dates, presents a single consolidated matching table, and uploads all after one confirmation. Uses `batch_lot_lookup` and `batch_upload_documents` tools to complete within 3–4 iterations regardless of file count.
- **Test result recognition:** Third-party lab reports (SGS, Eurofins, GFL, etc.) are automatically categorized as `test-results`, not `coa`, regardless of filename.
- **Inventory queries:** Answer questions about current stock (including discount items in overview), document coverage (COA + test result gaps), and import review status.
- **Discount management:** Move lots to Discount & Clearance or restore them, via conversation.
- **COA data management:** Review, correct, or supplement auto-extracted COA parameters via `save_coa_data` tool.
- **COA data backfill:** Re-extract parameters in bulk for COAs uploaded before auto-extraction existed. Uses `get_coa_backfill_status` then `backfill_coa_data` (up to 50 documents per call).
- **Import review:** View soft-excluded items from the last Excel import.
- **New arrivals:** Check for products flagged as new arrivals after sync, suggest sending a marketing email via `/admin/email`, and clear flags when dismissed.
- **Weekly sync workflow:** Import ERP data via CSV/Excel file upload (preferred) or by pasting pivot table data. File uploads are processed through the import pipeline (exclusion rules, warehouse/supplier normalization) automatically. Then run the sync diff engine, apply approved syncs, and generate reconciliation reports — completing the full sync end-to-end within the chat.
- **Markdown responses + true streaming:** Output renders with full markdown. Responses stream token-by-token via the Anthropic streaming API.

## Architecture

- Claude runs server-side via `@anthropic-ai/sdk` with streaming (`messages.stream()`), 26 tools (16 read-only, 10 action).
- Action tools (`upload_document`, `batch_upload_documents`, `create_discount_item`, `restore_discount_item`, `save_coa_data`, `backfill_coa_data`, `clear_new_arrivals`, `save_proposed_inventory`, `apply_sync`, `import_inventory_file`) require conversational confirmation before execution — enforced via system prompt.
- Files are uploaded in-band with the chat message (multipart form data) and persisted to a per-user temp directory (`.agent-uploads/{user}/`) — auto-cleaned after 30 min.
- Responses stream via SSE with tool activity indicators. Max 10 tool-use iterations per request with a user-visible warning if the limit is reached.
- Requires `ANTHROPIC_API_KEY` in `.env.local`.

## Conversation Persistence

Agent chat sessions are saved to SQLite and survive page reloads.

- **Auto-save:** After each assistant response completes (fire-and-forget).
- **Conversation list:** Dropdown in the header bar shows recent conversations (up to 20).
- **Resume / New chat / Delete:** Per-conversation controls in the history dropdown.
- **Storage:** Only `apiHistory` (plain `{role, content}` pairs) is persisted — tool events are transient.
- **Ownership:** Conversations are scoped by user email.
- **Preserved during weekly sync** (`npm run sync`). **Cleared during full seed** (`npm run seed`).

## API Usage Tracking

- **Token capture:** After each Anthropic API call in the tool loop, tokens are accumulated. One `api_usage` row is recorded per user request (summing all iterations).
- **Cost calculation:** Server-side, using rates from `data/api-pricing.json`.
- **Stats bar:** Compact bar above the chat area showing daily/monthly/yearly call count and cost.
- **Pricing updates:** Run `npm run update-pricing` to fetch current rates.

## Security

- Auth required: `qa` or `reviewer` role
- File validation: 50 MB limit, MIME type checks (PDF, JPEG, PNG, GIF, WebP, CSV, XLSX, XLS)
- Path traversal protection: `resolve(filepath).startsWith(uploadsRoot + "/")` guard on every write and read path
- Per-user temp file isolation: uploaded files scoped by user email, auto-expire after 30 min
- Error messages sanitized — internal errors logged server-side, generic messages sent to client
- Link URL validation — only `http://` and `https://` URLs rendered as clickable links in markdown
- Claude system prompt prohibits discussing customer names, pricing, or internal references
- Claude system prompt rule 9: must report tool errors to user (never silently claim success after a failed tool call)
- Conversation message validation: role must be "user" or "assistant", content capped at 500KB, max 200 messages per save

## Key Files

- `lib/agent-db.ts` — Agent-specific DB queries (lot lookup, contract lookup, product search, sync info, test-result coverage)
- `lib/agent-tools.ts` — Tool definitions and server-side execution logic
- `lib/conversations.ts` — Conversation persistence CRUD
- `app/api/agent/chat/route.ts` — Streaming SSE endpoint with agentic tool-use loop (max 10 iterations)
- `app/api/agent/conversations/route.ts` — List + create conversation endpoints
- `app/api/agent/conversations/[id]/route.ts` — Get + delete conversation endpoints
- `app/api/agent/conversations/[id]/messages/route.ts` — Save messages endpoint
- `app/admin/agent/layout.tsx` — Auth guard (qa OR reviewer role), full-viewport fixed layout
- `app/admin/agent/AgentChat.tsx` — Client chat UI with file attachments, drag-and-drop, streaming, conversation persistence
- `app/admin/agent/MarkdownMessage.tsx` — Markdown renderer for assistant messages
- `data/api-pricing.json` — Per-model token rates
- `scripts/update-pricing.ts` — Fetches and parses Anthropic pricing page
- `lib/api-usage.ts` — Record usage, calculate cost, query stats
- `app/api/agent/usage/route.ts` — GET stats endpoint
- `app/admin/agent/UsageStatsBar.tsx` — Stats bar component
