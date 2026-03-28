import { getInventory } from "@/lib/inventory-db";
import { getFlags } from "@/lib/product-flags";
import { getTotalQuantity, getTotalWeight } from "@/lib/inventory";
import EmailComposerClient from "./EmailComposerClient";

export const dynamic = "force-dynamic";

export default function EmailPage() {
  const { products } = getInventory();
  const flags = getFlags();

  // Build product summaries for the client
  const productSummaries = products.map((p) => {
    const origins = [...new Set(p.listings.map((l) => l.countryOfOrigin))];
    return {
      id: p.id,
      product: p.product,
      commodity: p.commodity,
      format: p.format,
      organic: p.organic,
      packSize: p.packSize,
      unitType: p.unitType,
      origins,
      totalQuantity: getTotalQuantity(p),
      totalWeightLbs: getTotalWeight(p),
    };
  });

  // Map flags into a lookup structure for the client
  const flagMap: Record<string, { newArrival: boolean; featured: boolean }> = {};
  for (const f of flags) {
    if (!flagMap[f.productId]) {
      flagMap[f.productId] = { newArrival: false, featured: false };
    }
    if (f.flag === "new_arrival") flagMap[f.productId].newArrival = true;
    if (f.flag === "featured") flagMap[f.productId].featured = true;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <EmailComposerClient products={productSummaries} initialFlags={flagMap} />
    </div>
  );
}
