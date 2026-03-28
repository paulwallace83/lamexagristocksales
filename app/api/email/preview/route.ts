import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getInventory, getInventoryStats } from "@/lib/inventory-db";
import { getFlaggedProductIds } from "@/lib/product-flags";
import { renderEmailHtml, toEmailProduct, type EmailData } from "@/lib/email-template";
import { getTotalWeight } from "@/lib/inventory";
import { EMAIL_CONFIG } from "@/emails/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { products } = getInventory();
  const stats = getInventoryStats();
  const newArrivalIds = getFlaggedProductIds("new_arrival");
  const featuredIds = getFlaggedProductIds("featured");

  const emailProducts = products.map(toEmailProduct);
  const newArrivals = emailProducts.filter((p) => newArrivalIds.has(p.id));
  const featured = emailProducts.filter((p) => featuredIds.has(p.id));

  // Group by format
  const formatOrder = ["IQF", "Juice Concentrate", "Puree"];
  const formatMap = new Map<string, { count: number; weight: number }>();
  for (const p of products) {
    const entry = formatMap.get(p.format) ?? { count: 0, weight: 0 };
    entry.count++;
    entry.weight += getTotalWeight(p);
    formatMap.set(p.format, entry);
  }
  const formatGroups = formatOrder
    .filter((f) => formatMap.has(f))
    .map((f) => ({
      format: f,
      productCount: formatMap.get(f)!.count,
      totalWeightLbs: formatMap.get(f)!.weight,
    }));

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const data: EmailData = {
    date: today,
    newArrivals,
    featured,
    formatGroups,
    stats: {
      totalProducts: stats.totalProducts,
      totalWeightLbs: stats.totalWeightLbs,
      uniqueOrigins: stats.uniqueOrigins,
      uniqueWarehouses: stats.uniqueWarehouses,
    },
    subject: EMAIL_CONFIG.defaultSubject,
  };

  const html = renderEmailHtml(data);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
