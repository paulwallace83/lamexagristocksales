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
           COALESCE(SUM(li.quantity), 0)   AS total_quantity,
           COALESCE(SUM(li.weight_lbs), 0) AS total_weight,
           GROUP_CONCAT(DISTINCT li.warehouse) AS warehouses,
           COUNT(DISTINCT lo.id) AS lot_count
    FROM products p
    LEFT JOIN listings li ON li.product_id = p.id
    LEFT JOIN lots lo     ON lo.listing_id  = li.id
    GROUP BY p.id
    ORDER BY p.commodity, p.product
  `).all() as Array<{
    id: string; product: string; commodity: string; format: string; organic: number;
    total_quantity: number; total_weight: number; warehouses: string | null; lot_count: number;
  }>;

  return rows.map((r) => ({
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
    WHERE LOWER(lo.lot_number) LIKE LOWER(?)
    ORDER BY p.commodity, p.product
  `).all(`%${lotNumber}%`) as Array<{
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

/** Find products and lots associated with a contract/container reference. */
export function findByContractNumber(contractRef: string): ContractMatch[] {
  const db = getDb();

  // Match both full ref (124717-04) and base contract (124717)
  const searchPattern = contractRef.includes("-")
    ? contractRef
    : `${contractRef}%`;

  const rows = db.prepare(`
    SELECT DISTINCT lc.contract,
           lo.id AS lot_id, lo.lot_number, lo.quantity, lo.weight_lbs, lo.bbd,
           p.id AS product_id, p.product, p.commodity, p.format
    FROM lot_contracts lc
    JOIN lots lo     ON lc.lot_id = lo.id
    JOIN listings li ON lo.listing_id = li.id
    JOIN products p  ON li.product_id = p.id
    WHERE lc.contract LIKE ?
    ORDER BY p.commodity, lo.lot_number
  `).all(searchPattern) as Array<{
    contract: string; lot_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string;
    product_id: string; product: string; commodity: string; format: string;
  }>;

  // Group by product
  const byProduct = new Map<string, ContractMatch>();
  for (const r of rows) {
    const base = r.contract.split("-")[0];
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, {
        product: { id: r.product_id, product: r.product, commodity: r.commodity, format: r.format },
        baseContract: base,
        lots: [],
      });
    }
    byProduct.get(r.product_id)!.lots.push({
      id: r.lot_id,
      lotNumber: r.lot_number,
      quantity: r.quantity,
      weightLbs: r.weight_lbs,
      bbd: r.bbd,
    });
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
  const like = `%${query}%`;

  const rows = db.prepare(`
    SELECT id, product, commodity, format, organic
    FROM products
    WHERE LOWER(product)       LIKE LOWER(?)
       OR LOWER(commodity)     LIKE LOWER(?)
       OR LOWER(specification) LIKE LOWER(?)
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
