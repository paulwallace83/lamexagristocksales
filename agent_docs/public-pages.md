# Public Inventory Page & Product Detail

## Public Inventory Page (`/`)

- Products are **grouped by format** (IQF, Juice Concentrate, Puree) with collapsible section headers showing product count and total weight.
- **Cascading filters** — each filter dropdown shows only options available given the other active filters.
- Type labels display as "Organic" (green) or "Conventional" (gray) — no abbreviations, no icons.
- The "Organic" certification badge is not shown under product names (redundant with the Type column).
- Format column is not shown per row (redundant with format group headers).
- **No Price column** in the inventory table. Pricing is handled on the product detail page via "Request Quote".
- **Clickable rows** — entire desktop table rows navigate to the product detail page on click. A subtle chevron arrow (→) on the right indicates clickability. Product name is also a direct link for accessibility.
- **No global "Request Quote" button** in the header nav. All enquiries flow through the product detail page.
- Mobile cards are fully clickable links to the product detail page.
- **Discount & Clearance section** — collapsible, amber/gold accent, below the main format groups. Collapsed by default, hidden when empty. Not included in main filter dropdowns or inventory stats.

## Product Detail Page (`/product/[id]`)

- Lot rows show: quantity, weight, BBD, COA pill data (max 6 pills), test type badges.
- Past-BBD dates highlighted in amber for buyer awareness — no "expired" language or removal.
- Lot numbers and Lamex reference numbers visible to customers.
- "Request Quote" button links to `/contact?productId={id}&product={name}`.
- Product photos shown only for IQF/frozen (not JC or Puree).
- Certifications listed in header; "Organic" filtered out (shown as dedicated badge instead).

## Industry Context

- Understand common processed fruit/veg terminology (Brix, mesh size, diced vs sliced vs whole, IQF vs block frozen, single strength vs concentrate)
- Buyers care about: origin, food safety certs, shelf life, cold chain integrity, and pricing competitiveness
- COAs typically include: micro results (TPC, coliform, yeast/mold, E. coli, Salmonella, Listeria), Brix, pH, color, defects, moisture
- Warehouse locations matter for freight cost — always display prominently
- Certifications (USDA Organic, Kosher, BRC, SQF, Non-GMO Project) are key differentiators
