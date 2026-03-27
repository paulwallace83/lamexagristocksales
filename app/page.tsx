import { getInventory } from "@/lib/inventory-db";
import InventoryTable from "@/components/InventoryTable";

export default function Home() {
  const { products, lastUpdated } = getInventory();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Inventory</h2>
        <p className="text-gray-500">
          Browse our current stock of processed fruits and vegetables. Filter by commodity, format,
          origin, or warehouse location. Click any product for full details.
        </p>
      </div>

      <InventoryTable products={products} lastUpdated={lastUpdated} />
    </div>
  );
}
