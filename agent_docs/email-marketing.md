# Marketing Email

Weekly HTML marketing emails sent to buyers via Resend, highlighting current inventory, new arrivals, and featured items.

## Workflow

1. **Auto-detection:** During `npm run sync`, new products (IDs in proposed but not in snapshot) are auto-flagged as `new_arrival` in the `product_flags` table.
2. **Compose:** Admin visits `/admin/email` (reviewer role only), sees all products with toggleable "New" and "Featured" badges.
3. **Preview:** Live email preview in an iframe (loads from `GET /api/email/preview`).
4. **Send:** Enter recipient emails (comma or newline separated), click Send. `POST /api/email/send` renders the HTML and dispatches via Resend.

## Product Flags

- `product_flags` SQLite table tracks `new_arrival` and `featured` flags per product.
- **Preserved during weekly sync** (not in the DELETE list).
- `new_arrival` flags are replaced each sync (old ones cleared, new ones set by sync script).
- `featured` flags are manual and persist across syncs.

## Email Template

- Self-contained HTML with inline CSS and table-based layout (Outlook compatible).
- Sections: navy header with logo, stats bar, new arrivals (green), featured items (blue), category summary by format, CTA button, footer.
- No product photos — text/badge layout only.
- Price always "Inquire".
- Rendered by `renderEmailHtml()` in `lib/email-template.ts`.

## Configuration

- `RESEND_API_KEY` in `.env.local` (required for sending).
- `NEXT_PUBLIC_SITE_URL` in `.env.local` (for CTA links and logo URL; defaults to `https://www.lamexagrifoodsinventory.com`).
- Branding constants in `emails/config.ts`.

## Key Files

- `emails/config.ts` — Branding constants (colors, logo URL, from address, default subject)
- `lib/product-flags.ts` — CRUD for product_flags table
- `lib/email-template.ts` — HTML email renderer
- `lib/email-send.ts` — Resend sending wrapper
- `app/admin/email/` — Admin composer UI (layout, page, EmailComposerClient)
- `app/api/email/flags/route.ts` — GET/POST product flags
- `app/api/email/preview/route.ts` — GET rendered email HTML
- `app/api/email/send/route.ts` — POST send via Resend
