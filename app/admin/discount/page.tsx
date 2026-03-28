import { getDiscountItems } from "@/lib/discount";
import { getInventory } from "@/lib/inventory-db";
import DiscountFormClient from "./DiscountFormClient";

export const dynamic = "force-dynamic";

export default function DiscountPage() {
  const discountItems = getDiscountItems("all");
  const { products } = getInventory();

  // Full product data with lots for the lot picker
  const productOptions = products.map((p) => ({
    id: p.id,
    product: p.product,
    commodity: p.commodity,
    category: p.category,
    format: p.format,
    organic: p.organic,
    packSize: p.packSize,
    unitType: p.unitType,
    listings: p.listings.map((l) => ({
      id: l.id,
      warehouse: l.warehouse,
      city: l.city,
      state: l.state,
      supplier: l.supplier,
      countryOfOrigin: l.countryOfOrigin,
      lots: l.lots.map((lot) => ({
        lotNumber: lot.lotNumber,
        quantity: lot.quantity,
        weightLbs: lot.weightLbs,
        bbd: lot.bbd,
        contracts: lot.contracts,
      })),
    })),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <DiscountFormClient
        existingItems={discountItems}
        productOptions={productOptions}
      />
    </div>
  );
}
