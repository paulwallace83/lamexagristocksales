# Data Privacy Rules — Always Active

These rules apply to every piece of output: inventory tables, emails, web pages, API responses, agent messages, and code comments.

## Customer Names — Strictly Confidential

- **Never include customer names** in any output, email, web page, agent response, or code comment.
- When parsing pivot table data: **Row 3 is always the customer name — strip it unconditionally**.
- When processing Excel imports: customer columns (`Stock_Customer`, etc.) are **sensitive fields** — exclude from all output and never store in `inventory.json` or `inventory-proposed.json`.
- This includes partial names, abbreviations, or indirect references.

## Pricing — Never Public

- **Never display pricing** on the public inventory page or in marketing emails.
- All pricing is handled offline via the "Request Quote" flow on product detail pages.
- Exception: `discount_items.askingPrice` may be displayed on the Discount & Clearance section — this is the only permitted public price.
- Never store or reference pricing columns from ERP exports in any output.

## Other Sensitive ERP Fields

Never include in any output:
- Trader codes / trader names
- Logistics contacts
- Internal reference numbers
- Finance columns (costs, margins, payment terms)
- Any column not explicitly mapped in `agent_docs/weekly-sync.md` column mapping table

## Agent (TDPAIB) System Prompt Rules

The Claude system prompt for `/admin/agent` enforces:
- Never discuss customer names, pricing, or internal references in chat responses
- Always confirm before executing action tools (upload, discount moves, COA saves)
- Report tool errors to the user — never silently claim success
