import { getDb } from "./db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProductSummary {
  id: string;
  product: string;
  commodity: string;
  format: string;
  organic: boolean;
  totalQuantity: number;
  totalWeightLbs: number;
  warehouses: string[];
  lotCount: number;
}

export interface LotMatch {
  product: { id: string; product: string; commodity: string; format: string; organic: boolean };
  listing: { id: number; warehouse: string; city: string; state: string; supplier: string };
  lot: { id: number; lotNumber: string; quantity: number; weightLbs: number; bbd: string; contracts: string[] };
}

export interface ContractMatch {
  product: { id: string; product: string; commodity: string; format: string };
  baseContract: string;
  lots: Array<{ id: number; lotNumber: string; quantity: number; weightLbs: number; bbd: string }>;
}

export interface ProductSearchResult {
  id: string;
  product: string;
  commodity: string;
  format: string;
  organic: boolean;
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

/** Lightweight product list for agent context (no lot/contract nesting). */
export function getProductSummaries(): ProductSummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT p.id, p.product, p.commodity, p.format, p.organic,
           COALESCE(agg.total_quantity, 0)   AS total_quantity,
           COALESCE(agg.total_weight, 0)     AS total_weight,
           agg.warehouses,
           COALESCE(agg.lot_count, 0)        AS lot_count
    FROM products p
    LEFT JOIN (
      SELECT li.product_id,
             SUM(li.quantity)   AS total_quantity,
             SUM(li.weight_lbs) AS total_weight,
             GROUP_CONCAT(DISTINCT li.warehouse) AS warehouses,
             (SELECT COUNT(*) FROM lots lo2 JOIN listings li2 ON lo2.listing_id = li2.id WHERE li2.product_id = li.product_id) AS lot_count
      FROM listings li
      GROUP BY li.product_id
    ) agg ON agg.product_id = p.id
    ORDER BY p.commodity, p.product
  `).all() as Array<{
    id: string; product: string; commodity: string; format: string; organic: number;
    total_quantity: number; total_weight: number; warehouses: string | null; lot_count: number;
  }>;

  return rows
    .filter((r) => r.total_quantity > 0 || r.total_weight > 0)
    .map((r) => ({
      id: r.id,
      product: r.product,
      commodity: r.commodity,
      format: r.format,
      organic: r.organic === 1,
      totalQuantity: r.total_quantity,
      totalWeightLbs: Math.round(r.total_weight),
      warehouses: r.warehouses ? r.warehouses.split(",") : [],
      lotCount: r.lot_count,
    }));
}

/** Find lots by number — partial, case-insensitive. Returns all matches. */
export function findLotsByNumber(lotNumber: string): LotMatch[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT lo.id AS lot_id, lo.lot_number, lo.quantity, lo.weight_lbs, lo.bbd,
           li.id AS listing_id, li.warehouse, li.city, li.state, li.supplier,
           p.id AS product_id, p.product, p.commodity, p.format, p.organic
    FROM lots lo
    JOIN listings li ON lo.listing_id = li.id
    JOIN products p  ON li.product_id = p.id
    WHERE LOWER(lo.lot_number) LIKE LOWER(?) ESCAPE '\'
    ORDER BY p.commodity, p.product
  `).all(`%${lotNumber.replace(/[%_]/g, "\\$&")}%`) as Array<{
    lot_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string;
    listing_id: number; warehouse: string; city: string; state: string; supplier: string;
    product_id: string; product: string; commodity: string; format: string; organic: number;
  }>;

  return rows.map((r) => {
    const contracts = (db.prepare(
      "SELECT contract FROM lot_contracts WHERE lot_id = ?",
    ).all(r.lot_id) as Array<{ contract: string }>).map((c) => c.contract);

    return {
      product: {
        id: r.product_id,
        product: r.product,
        commodity: r.commodity,
        format: r.format,
        organic: r.organic === 1,
      },
      listing: {
        id: r.listing_id,
        warehouse: r.warehouse,
        city: r.city,
        state: r.state,
        supplier: r.supplier,
      },
      lot: {
        id: r.lot_id,
        lotNumber: r.lot_number,
        quantity: r.quantity,
        weightLbs: r.weight_lbs,
        bbd: r.bbd,
        contracts,
      },
    };
  });
}

/**
 * Batch version of findLotsByNumber — accepts multiple lot numbers, returns
 * results keyed by the input string. Each lot number is matched independently
 * using the same partial-match LIKE query.
 */
export function findLotsByNumbers(lotNumbers: string[]): Map<string, LotMatch[]> {
  const results = new Map<string, LotMatch[]>();
  const seen = new Set<string>();

  for (const raw of lotNumbers) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    results.set(trimmed, findLotsByNumber(trimmed));
  }

  return results;
}

/** Find products and lots associated with a contract/container reference. */
export function findByContractNumber(contractRef: string): ContractMatch[] {
  const db = getDb();

  // Match both full ref (124717-04) and base contract (124717)
  const escaped = contractRef.replace(/[%_]/g, "\\$&");
  const searchPattern = contractRef.includes("-")
    ? escaped
    : `${escaped}%`;

  const rows = db.prepare(`
    SELECT DISTINCT lc.contract,
           lo.id AS lot_id, lo.lot_number, lo.quantity, lo.weight_lbs, lo.bbd,
           p.id AS product_id, p.product, p.commodity, p.format
    FROM lot_contracts lc
    JOIN lots lo     ON lc.lot_id = lo.id
    JOIN listings li ON lo.listing_id = li.id
    JOIN products p  ON li.product_id = p.id
    WHERE lc.contract LIKE ? ESCAPE '\'
    ORDER BY p.commodity, lo.lot_number
  `).all(searchPattern) as Array<{
    contract: string; lot_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string;
    product_id: string; product: string; commodity: string; format: string;
  }>;

  // Group by product, dedup lots
  const byProduct = new Map<string, ContractMatch>();
  const seenLots = new Set<number>();
  for (const r of rows) {
    const base = r.contract.split("-")[0];
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, {
        product: { id: r.product_id, product: r.product, commodity: r.commodity, format: r.format },
        baseContract: base,
        lots: [],
      });
    }
    if (!seenLots.has(r.lot_id)) {
      seenLots.add(r.lot_id);
      byProduct.get(r.product_id)!.lots.push({
        id: r.lot_id,
        lotNumber: r.lot_number,
        quantity: r.quantity,
        weightLbs: r.weight_lbs,
        bbd: r.bbd,
      });
    }
  }

  return Array.from(byProduct.values());
}

/** Get the last sync timestamp from the metadata table. */
export function getSyncInfo(): { lastUpdated: string } {
  const db = getDb();
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get("lastUpdated") as
    | { value: string }
    | undefined;
  return { lastUpdated: row?.value ?? "unknown" };
}

/** Full-text search on product name, commodity, and specification. */
export function searchProducts(query: string): ProductSearchResult[] {
  const db = getDb();
  const escaped = query.replace(/[%_]/g, "\\$&");
  const like = `%${escaped}%`;

  const rows = db.prepare(`
    SELECT id, product, commodity, format, organic
    FROM products
    WHERE LOWER(product)       LIKE LOWER(?) ESCAPE '\'
       OR LOWER(commodity)     LIKE LOWER(?) ESCAPE '\'
       OR LOWER(specification) LIKE LOWER(?) ESCAPE '\'
    ORDER BY commodity, product
    LIMIT 20
  `).all(like, like, like) as Array<{
    id: string; product: string; commodity: string; format: string; organic: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    product: r.product,
    commodity: r.commodity,
    format: r.format,
    organic: r.organic === 1,
  }));
}

/* ------------------------------------------------------------------ */
/*  COA backfill                                                       */
/* ------------------------------------------------------------------ */

export interface BackfillProduct {
  productId: string;
  product: string;
  documents: Array<{
    documentId: string;
    filename: string;
    lots: Array<{ lotId: number; lotNumber: string }>;
  }>;
}

export interface BackfillStatus {
  totalDocuments: number;
  totalLots: number;
  productCount: number;
  products: BackfillProduct[];
}

export interface BackfillDocument {
  documentId: string;
  filename: string;
  productId: string;
  /** First linked lot's number — used to resolve the file path on disk. */
  lotNumber: string;
  lots: Array<{ lotId: number; lotNumber: string }>;
}

/**
 * Find all COA documents that have linked lots but no extracted coa_data.
 * Groups by product → document for a clear summary.
 */
export function getCoaBackfillStatus(): BackfillStatus {
  const db = getDb();

  const rows = db.prepare(`
    SELECT d.id AS document_id, d.filename, d.product_id,
           p.product,
           lo.id AS lot_id, lo.lot_number
    FROM documents d
    JOIN document_lots dl ON dl.document_id = d.id
    JOIN lots lo ON dl.lot_id = lo.id
    JOIN listings li ON lo.listing_id = li.id
    JOIN products p ON li.product_id = p.id
    LEFT JOIN coa_data cd ON lo.id = cd.lot_id
    WHERE d.category = 'coa' AND cd.lot_id IS NULL
    ORDER BY d.product_id, lo.lot_number
  `).all() as Array<{
    document_id: string; filename: string; product_id: string;
    product: string; lot_id: number; lot_number: string;
  }>;

  // Group by product, then by document
  const productMap = new Map<string, BackfillProduct>();
  const docLots = new Map<string, Array<{ lotId: number; lotNumber: string }>>();

  for (const r of rows) {
    if (!productMap.has(r.product_id)) {
      productMap.set(r.product_id, {
        productId: r.product_id,
        product: r.product,
        documents: [],
      });
    }
    const key = r.document_id;
    if (!docLots.has(key)) docLots.set(key, []);
    docLots.get(key)!.push({ lotId: r.lot_id, lotNumber: r.lot_number });
  }

  // Build document entries per product
  const seenDocs = new Set<string>();
  for (const r of rows) {
    if (seenDocs.has(r.document_id)) continue;
    seenDocs.add(r.document_id);
    productMap.get(r.product_id)!.documents.push({
      documentId: r.document_id,
      filename: r.filename,
      lots: docLots.get(r.document_id)!,
    });
  }

  const products = Array.from(productMap.values());
  const totalDocuments = seenDocs.size;
  // Dedup lots — a lot linked to multiple COA documents should only count once
  const uniqueLots = new Set(rows.map((r) => r.lot_id));
  const totalLots = uniqueLots.size;

  return { totalDocuments, totalLots, productCount: products.length, products };
}

/**
 * Get the flat list of unique COA documents needing backfill, with all linked
 * lots that are missing coa_data. Optionally filter to specific lot numbers.
 * Capped at 50 documents to keep API costs bounded.
 */
export function getCoaBackfillDocuments(lotNumbers?: string[]): BackfillDocument[] {
  const db = getDb();

  let query = `
    SELECT d.id AS document_id, d.filename, d.product_id,
           lo.id AS lot_id, lo.lot_number
    FROM documents d
    JOIN document_lots dl ON dl.document_id = d.id
    JOIN lots lo ON dl.lot_id = lo.id
    JOIN listings li ON lo.listing_id = li.id
    LEFT JOIN coa_data cd ON lo.id = cd.lot_id
    WHERE d.category = 'coa' AND cd.lot_id IS NULL
  `;
  const params: string[] = [];

  if (lotNumbers && lotNumbers.length > 0) {
    // Cap to prevent unbounded IN clause
    const bounded = lotNumbers.slice(0, 100);
    const placeholders = bounded.map(() => "?").join(",");
    query += ` AND lo.lot_number IN (${placeholders})`;
    params.push(...bounded);
  }

  query += " ORDER BY d.product_id, lo.lot_number";

  const rows = db.prepare(query).all(...params) as Array<{
    document_id: string; filename: string; product_id: string;
    lot_id: number; lot_number: string;
  }>;

  // Group by document, dedup
  const docMap = new Map<string, BackfillDocument>();
  for (const r of rows) {
    if (!docMap.has(r.document_id)) {
      docMap.set(r.document_id, {
        documentId: r.document_id,
        filename: r.filename,
        productId: r.product_id,
        lotNumber: r.lot_number, // first lot for file path
        lots: [],
      });
    }
    docMap.get(r.document_id)!.lots.push({ lotId: r.lot_id, lotNumber: r.lot_number });
  }

  // Cap at 50 documents
  return Array.from(docMap.values()).slice(0, 50);
}

/* ------------------------------------------------------------------ */
/*  Test-result coverage                                               */
/* ------------------------------------------------------------------ */

export interface TestResultCoverage {
  productId: string;
  product: string;
  format: string;
  organic: boolean;
  lotCount: number;
  lotsWithTestResults: number;
  lotsWithCOA: number;
  expectedTest: string | null; // "heavy-metals" | "pesticide" | null
  missingTestLots: Array<{ id: number; lotNumber: string }>;
}

/** Get test-result coverage per product, flagging lots that are expected to have tests. */
export function getTestResultCoverage(): TestResultCoverage[] {
  const db = getDb();

  const products = db.prepare(`
    SELECT id, product, format, organic FROM products
    ORDER BY commodity, product
  `).all() as Array<{ id: string; product: string; format: string; organic: number }>;

  return products.map((p) => {
    const lots = db.prepare(`
      SELECT lo.id, lo.lot_number
      FROM lots lo
      JOIN listings li ON lo.listing_id = li.id
      WHERE li.product_id = ?
    `).all(p.id) as Array<{ id: number; lot_number: string }>;

    const lotsWithTestResults = new Set(
      (db.prepare(`
        SELECT DISTINCT dl.lot_id
        FROM document_lots dl
        JOIN documents d ON dl.document_id = d.id
        WHERE d.product_id = ? AND d.category = 'test-results'
      `).all(p.id) as Array<{ lot_id: number }>).map((r) => r.lot_id),
    );

    const lotsWithCOA = new Set(
      (db.prepare(`
        SELECT DISTINCT dl.lot_id
        FROM document_lots dl
        JOIN documents d ON dl.document_id = d.id
        WHERE d.product_id = ? AND d.category = 'coa'
      `).all(p.id) as Array<{ lot_id: number }>).map((r) => r.lot_id),
    );

    const isJC = p.format === "Juice Concentrate";
    const isOrganic = p.organic === 1;
    const expectedTest = isJC ? "heavy-metals" : isOrganic ? "pesticide" : null;

    const missingTestLots = expectedTest
      ? lots.filter((l) => !lotsWithTestResults.has(l.id)).map((l) => ({ id: l.id, lotNumber: l.lot_number }))
      : [];

    return {
      productId: p.id,
      product: p.product,
      format: p.format,
      organic: isOrganic,
      lotCount: lots.length,
      lotsWithTestResults: lotsWithTestResults.size,
      lotsWithCOA: lotsWithCOA.size,
      expectedTest,
      missingTestLots,
    };
  }).filter((p) => p.lotCount > 0);
}
