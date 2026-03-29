import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/inventory-db";
import { getDocumentsForProduct } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Public endpoint — returns which restricted documents exist per lot and per contract
 * for a product, without exposing file URLs.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string" || id.length > 200) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = getProductById(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const documents = getDocumentsForProduct(id);

  // Build per-lot availability for COA and test-results
  const lotMap = new Map<string, { hasCOA: boolean; hasTestResults: boolean }>();
  for (const listing of product.listings) {
    for (const lot of listing.lots) {
      const lotDocs = documents.filter((d) => d.lotIds.includes(lot.id));
      lotMap.set(lot.lotNumber, {
        hasCOA: lotDocs.some((d) => d.category === "coa"),
        hasTestResults: lotDocs.some((d) => d.category === "test-results"),
      });
    }
  }

  // Build per-contract availability for specs
  const contractSet = new Set<string>();
  for (const listing of product.listings) {
    for (const lot of listing.lots) {
      for (const c of lot.contracts) {
        const base = c.includes("-") ? c.split("-")[0] : c;
        contractSet.add(base);
      }
    }
  }

  const contracts = Array.from(contractSet).map((bc) => ({
    baseContract: bc,
    hasSpecs: documents.some((d) => d.baseContract === bc && d.category === "specs"),
  }));

  return NextResponse.json({
    productId: id,
    productName: product.product,
    lots: Array.from(lotMap.entries()).map(([lotNumber, avail]) => ({
      lotNumber,
      ...avail,
    })),
    contracts,
  });
}
