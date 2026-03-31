import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/inventory-db";
import { getDocumentsForProduct } from "@/lib/documents";
import { getCoaDataForLots, formatCoaFields, detectCoaTestTypes } from "@/lib/coa-data";

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

  if (!id || typeof id !== "string" || id.length > 200 || !/^[a-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = getProductById(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const documents = getDocumentsForProduct(id);

  // Collect all lot IDs for batch COA data fetch
  const allLotIds: number[] = [];
  for (const listing of product.listings) {
    for (const lot of listing.lots) allLotIds.push(lot.id);
  }
  const coaDataMap = getCoaDataForLots(allLotIds);

  // Build per-lot availability for COA, typed test results, and COA fields.
  // Keyed by lot.id (unique) rather than lot.lotNumber to prevent collision when the
  // same lot number appears in multiple listings for the same product.
  const lotMap = new Map<number, { lotNumber: string; hasCOA: boolean; testResultTypes: string[]; coaFields: { label: string; value: string }[] }>();
  for (const listing of product.listings) {
    for (const lot of listing.lots) {
      const lotDocs = documents.filter((d) => d.lotIds.includes(lot.id));
      const testDocs = lotDocs.filter((d) => d.category === "test-results");

      // Determine test result types from document filenames (same logic as product detail page)
      const docLabels = new Set<string>();
      for (const d of testDocs) {
        const name = (d.originalName || d.filename).toLowerCase();
        if (name.includes("heavy") || name.includes("metal") || /\bhm\b/.test(name)) {
          docLabels.add("Heavy Metal Test Results");
        } else if (name.includes("pesticide") || /\bpest\b/.test(name)) {
          docLabels.add("Pesticide Test Results");
        } else if (/micro(?!so)/i.test(name)) {
          docLabels.add("Microbiological Test Results");
        } else {
          docLabels.add("Test Results");
        }
      }

      // Fallback: check COA-extracted data for test types not already covered by documents
      const coaData = coaDataMap.get(lot.id);
      if (coaData) {
        const coaTestTypes = detectCoaTestTypes(coaData.fields);
        if (coaTestTypes.hasHeavyMetals && !docLabels.has("Heavy Metal Test Results")) {
          docLabels.add("Heavy Metal Test Results");
        }
        if (coaTestTypes.hasPesticide && !docLabels.has("Pesticide Test Results")) {
          docLabels.add("Pesticide Test Results");
        }
      }

      // Format COA fields for display (already filters sensitive data)
      let coaFields: { label: string; value: string }[] = [];
      if (coaData) {
        try { coaFields = formatCoaFields(coaData.fields); } catch { /* skip malformed data */ }
      }

      lotMap.set(lot.id, {
        lotNumber: lot.lotNumber,
        hasCOA: lotDocs.some((d) => d.category === "coa"),
        testResultTypes: Array.from(docLabels),
        coaFields,
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
    lots: Array.from(lotMap.values()).map(({ lotNumber, hasCOA, testResultTypes, coaFields }) => ({
      lotNumber,
      hasCOA,
      testResultTypes,
      coaFields,
    })),
    contracts,
  });
}
