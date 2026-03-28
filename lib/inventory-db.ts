import { getDb } from "./db";
import type { Product, Listing, Lot, InventoryData } from "./inventory";

interface ProductRow {
  id: string; product: string; commodity: string; category: string;
  format: string; process_type: string; specification: string | null;
  variety: string | null; grade: string | null; organic: number;
  pack_size: string; unit_type: string; storage_type: string | null;
}

interface ListingRow {
  id: number; product_id: string; warehouse: string; city: string;
  state: string; supplier: string; country_of_origin: string;
  quantity: number; weight_lbs: number; arrived: string; min_bbd: string;
  unit_type: string | null; pack_detail: string | null;
}

function buildLots(
  listingId: number,
  lotsByListing: Map<number, Array<{ id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string }>>,
  contractsByLot: Map<number, string[]>,
): Lot[] {
  const lotRows = lotsByListing.get(listingId) ?? [];
  return lotRows.map((r) => ({
    id: r.id,
    lotNumber: r.lot_number,
    quantity: r.quantity,
    weightLbs: r.weight_lbs,
    bbd: r.bbd,
    contracts: contractsByLot.get(r.id) ?? [],
  }));
}

function buildListing(
  l: ListingRow,
  contractsByListing: Map<number, string[]>,
  lotsByListing: Map<number, Array<{ id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string }>>,
  contractsByLot: Map<number, string[]>,
): Listing {
  return {
    id: l.id,
    warehouse: l.warehouse,
    city: l.city,
    state: l.state,
    supplier: l.supplier,
    countryOfOrigin: l.country_of_origin,
    quantity: l.quantity,
    weightLbs: l.weight_lbs,
    arrived: l.arrived,
    minBBD: l.min_bbd,
    contracts: contractsByListing.get(l.id) ?? [],
    ...(l.unit_type != null && { unitType: l.unit_type }),
    ...(l.pack_detail != null && { packDetail: l.pack_detail }),
    lots: buildLots(l.id, lotsByListing, contractsByLot),
  };
}

export function getInventory(): InventoryData {
  const db = getDb();

  const lastUpdatedRow = db.prepare("SELECT value FROM metadata WHERE key = ?").get("lastUpdated") as { value: string } | undefined;
  const lastUpdated = lastUpdatedRow?.value ?? "";

  const productRows = db.prepare("SELECT * FROM products").all() as ProductRow[];

  const allCerts = db.prepare("SELECT product_id, certification FROM product_certifications").all() as Array<{
    product_id: string; certification: string;
  }>;

  const allListings = db.prepare("SELECT * FROM listings ORDER BY id").all() as ListingRow[];

  const allContracts = db.prepare("SELECT listing_id, contract FROM listing_contracts").all() as Array<{
    listing_id: number; contract: string;
  }>;

  const allLots = db.prepare("SELECT * FROM lots ORDER BY id").all() as Array<{
    id: number; listing_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string;
  }>;

  const allLotContracts = db.prepare("SELECT lot_id, contract FROM lot_contracts").all() as Array<{
    lot_id: number; contract: string;
  }>;

  // Group certs by product_id
  const certsByProduct = new Map<string, string[]>();
  for (const c of allCerts) {
    const arr = certsByProduct.get(c.product_id) ?? [];
    arr.push(c.certification);
    certsByProduct.set(c.product_id, arr);
  }

  // Group contracts by listing_id
  const contractsByListing = new Map<number, string[]>();
  for (const c of allContracts) {
    const arr = contractsByListing.get(c.listing_id) ?? [];
    arr.push(c.contract);
    contractsByListing.set(c.listing_id, arr);
  }

  // Group lots by listing_id
  const lotsByListing = new Map<number, Array<{ id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string }>>();
  for (const l of allLots) {
    const arr = lotsByListing.get(l.listing_id) ?? [];
    arr.push(l);
    lotsByListing.set(l.listing_id, arr);
  }

  // Group lot contracts by lot_id
  const contractsByLot = new Map<number, string[]>();
  for (const c of allLotContracts) {
    const arr = contractsByLot.get(c.lot_id) ?? [];
    arr.push(c.contract);
    contractsByLot.set(c.lot_id, arr);
  }

  // Group listings by product_id
  const listingsByProduct = new Map<string, Listing[]>();
  for (const l of allListings) {
    const listing = buildListing(l, contractsByListing, lotsByListing, contractsByLot);
    const arr = listingsByProduct.get(l.product_id) ?? [];
    arr.push(listing);
    listingsByProduct.set(l.product_id, arr);
  }

  // Assemble products (exclude stubs with no listings — e.g., fully discounted products
  // kept only because documents reference them)
  const products: Product[] = productRows
    .filter((row) => (listingsByProduct.get(row.id) ?? []).length > 0)
    .map((row) => ({
      id: row.id,
      product: row.product,
      commodity: row.commodity,
      category: row.category,
      format: row.format,
      processType: row.process_type,
      specification: row.specification,
      variety: row.variety,
      grade: row.grade,
      organic: row.organic === 1,
      certifications: certsByProduct.get(row.id) ?? [],
      packSize: row.pack_size,
      unitType: row.unit_type,
      ...(row.storage_type != null && { storageType: row.storage_type }),
      listings: listingsByProduct.get(row.id) ?? [],
    }));

  return { lastUpdated, products };
}

export function getProductById(id: string): Product | undefined {
  const db = getDb();

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  if (!row) return undefined;

  const certs = db.prepare("SELECT certification FROM product_certifications WHERE product_id = ?")
    .all(row.id) as Array<{ certification: string }>;

  const listingRows = db.prepare("SELECT * FROM listings WHERE product_id = ? ORDER BY id")
    .all(row.id) as ListingRow[];

  // Load all lot and contract data for this product's listings
  const listingIds = listingRows.map((l) => l.id);

  const contractsByListing = new Map<number, string[]>();
  const lotsByListing = new Map<number, Array<{ id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string }>>();
  const contractsByLot = new Map<number, string[]>();

  if (listingIds.length > 0) {
    const placeholders = listingIds.map(() => "?").join(",");

    const contracts = db.prepare(`SELECT listing_id, contract FROM listing_contracts WHERE listing_id IN (${placeholders})`)
      .all(...listingIds) as Array<{ listing_id: number; contract: string }>;
    for (const c of contracts) {
      const arr = contractsByListing.get(c.listing_id) ?? [];
      arr.push(c.contract);
      contractsByListing.set(c.listing_id, arr);
    }

    const lots = db.prepare(`SELECT * FROM lots WHERE listing_id IN (${placeholders}) ORDER BY id`)
      .all(...listingIds) as Array<{ id: number; listing_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string }>;
    for (const l of lots) {
      const arr = lotsByListing.get(l.listing_id) ?? [];
      arr.push(l);
      lotsByListing.set(l.listing_id, arr);
    }

    const lotIds = lots.map((l) => l.id);
    if (lotIds.length > 0) {
      const lotPlaceholders = lotIds.map(() => "?").join(",");
      const lotContracts = db.prepare(`SELECT lot_id, contract FROM lot_contracts WHERE lot_id IN (${lotPlaceholders})`)
        .all(...lotIds) as Array<{ lot_id: number; contract: string }>;
      for (const c of lotContracts) {
        const arr = contractsByLot.get(c.lot_id) ?? [];
        arr.push(c.contract);
        contractsByLot.set(c.lot_id, arr);
      }
    }
  }

  const listings: Listing[] = listingRows.map((l) =>
    buildListing(l, contractsByListing, lotsByListing, contractsByLot),
  );

  return {
    id: row.id,
    product: row.product,
    commodity: row.commodity,
    category: row.category,
    format: row.format,
    processType: row.process_type,
    specification: row.specification,
    variety: row.variety,
    grade: row.grade,
    organic: row.organic === 1,
    certifications: certs.map((c) => c.certification),
    packSize: row.pack_size,
    unitType: row.unit_type,
    ...(row.storage_type != null && { storageType: row.storage_type }),
    listings,
  };
}

export function getAllProductIds(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT id FROM products").all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

export interface InventoryStats {
  totalProducts: number;
  totalWeightLbs: number;
  uniqueOrigins: number;
  uniqueWarehouses: number;
}

export function getInventoryStats(): InventoryStats {
  const db = getDb();
  const totals = db.prepare(
    "SELECT COUNT(DISTINCT product_id) as products, COALESCE(SUM(weight_lbs), 0) as weight FROM listings",
  ).get() as { products: number; weight: number };
  const origins = db.prepare(
    "SELECT COUNT(DISTINCT country_of_origin) as cnt FROM listings",
  ).get() as { cnt: number };
  const warehouses = db.prepare(
    "SELECT COUNT(DISTINCT warehouse) as cnt FROM listings",
  ).get() as { cnt: number };

  return {
    totalProducts: totals.products,
    totalWeightLbs: totals.weight,
    uniqueOrigins: origins.cnt,
    uniqueWarehouses: warehouses.cnt,
  };
}
