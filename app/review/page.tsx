import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

interface ReviewItem {
  reason: string;
  ruleType: string;
  product: string;
  specification: string;
  warehouse: string;
  supplier: string;
  origin: string;
  contract: string;
  cases: number;
  weight: number;
  unit: string;
  reserved: string;
  bbd: string | number;
  lotNumber: string;
}

export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/qa/login");

  const reviewPath = join(process.cwd(), "data", "import-review.json");

  if (!existsSync(reviewPath)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">No Import to Review</h1>
        <p className="text-gray-500">
          Run <code className="bg-gray-100 px-2 py-1 rounded text-sm">npm run import-excel</code> first
          to generate review items.
        </p>
      </div>
    );
  }

  let items: ReviewItem[] = [];
  try {
    items = JSON.parse(readFileSync(reviewPath, "utf-8"));
  } catch {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-red-700 mb-4">Error Reading Review Data</h1>
        <p className="text-gray-500">Could not parse data/import-review.json</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Review Complete</h1>
        <p className="text-gray-500">All items have been processed.</p>
      </div>
    );
  }

  // Aggregate items by customer + product for display
  const grouped = aggregateItems(items);

  return <ReviewClient groups={grouped} totalItems={items.length} />;
}

interface AggregatedGroup {
  key: string;
  reason: string;
  customer: string;
  product: string;
  specification: string;
  warehouse: string;
  supplier: string;
  origin: string;
  totalCases: number;
  totalWeight: number;
  reserved: boolean;
  itemIndices: number[];
}

function aggregateItems(items: ReviewItem[]): AggregatedGroup[] {
  const map = new Map<string, AggregatedGroup>();

  items.forEach((item, idx) => {
    // Extract customer from reason (e.g., "direct-customer: KRAFT HEINZ CO (THE)")
    const customer = item.reason.split(": ").slice(1).join(": ") || "Unknown";
    const key = `${customer}|||${item.product}|||${item.warehouse}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        reason: item.reason.split(":")[0],
        customer,
        product: item.product,
        specification: item.specification || "",
        warehouse: item.warehouse,
        supplier: item.supplier,
        origin: item.origin,
        totalCases: 0,
        totalWeight: 0,
        reserved: item.reserved === "Reserved",
        itemIndices: [],
      });
    }

    const group = map.get(key)!;
    group.totalCases += Math.abs(item.cases || 0);
    group.totalWeight += item.weight || 0;
    group.itemIndices.push(idx);
  });

  // Sort: reserved first, then by customer
  return [...map.values()].sort((a, b) => {
    if (a.reserved !== b.reserved) return a.reserved ? 1 : -1;
    return a.customer.localeCompare(b.customer);
  });
}
