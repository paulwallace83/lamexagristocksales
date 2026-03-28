import { getInventory, getInventoryStats } from "@/lib/inventory-db";
import { getProductDocMap } from "@/lib/documents";
import { formatWeight } from "@/lib/inventory";
import InventoryTable from "@/components/InventoryTable";

export default function Home() {
  const { products, lastUpdated } = getInventory();
  const stats = getInventoryStats();
  const docMap = getProductDocMap();

  // Serialize the doc map for the client component
  const productIdsWithDocs = Array.from(docMap.keys());

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1a2b5f] via-[#1e3a6f] to-[#243f75] text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Processed Fruit & Vegetable Inventory
          </h1>
          <p className="mt-3 text-lg text-white/70 max-w-2xl">
            IQF, purees, concentrates, and more — sourced globally, warehoused across the U.S. Browse our current availability and request a quote.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            <StatCard label="Products" value={String(stats.totalProducts)} />
            <StatCard label="Total Weight" value={formatWeight(stats.totalWeightLbs)} />
            <StatCard label="Origins" value={`${stats.uniqueOrigins} countries`} />
            <StatCard label="Warehouses" value={`${stats.uniqueWarehouses} locations`} />
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <InventoryTable
          products={products}
          lastUpdated={lastUpdated}
          productIdsWithDocs={productIdsWithDocs}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center md:text-left">
      <p className="text-2xl font-bold text-[#1a2b5f]">{value}</p>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
