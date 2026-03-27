import { getDb } from "./db";
import type { Product, Listing, InventoryData } from "./inventory";

export function getInventory(): InventoryData {
  const db = getDb();

  const lastUpdatedRow = db.prepare("SELECT value FROM metadata WHERE key = ?").get("lastUpdated") as { value: string } | undefined;
  const lastUpdated = lastUpdatedRow?.value ?? "";

  const productRows = db.prepare("SELECT * FROM products").all() as Array<{
    id: string; product: string; commodity: string; category: string;
    format: string; process_type: string; specification: string | null;
    variety: string | null; grade: string | null; organic: number;
    pack_size: string; unit_type: string; storage_type: string | null;
  }>;

  const allCerts = db.prepare("SELECT product_id, certification FROM product_certifications").all() as Array<{
    product_id: string; certification: string;
  }>;

  const allListings = db.prepare("SELECT * FROM listings ORDER BY id").all() as Array<{
    id: number; product_id: string; warehouse: string; city: string;
    state: string; supplier: string; country_of_origin: string;
    quantity: number; weight_lbs: number; arrived: string; min_bbd: string;
    unit_type: string | null; pack_detail: string | null;
  }>;

  const allContracts = db.prepare("SELECT listing_id, contract FROM listing_contracts").all() as Array<{
    listing_id: number; contract: string;
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

  // Group listings by product_id
  const listingsByProduct = new Map<string, Listing[]>();
  for (const l of allListings) {
    const listing: Listing = {
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
    };
    const arr = listingsByProduct.get(l.product_id) ?? [];
    arr.push(listing);
    listingsByProduct.set(l.product_id, arr);
  }

  // Assemble products
  const products: Product[] = productRows.map((row) => ({
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

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as {
    id: string; product: string; commodity: string; category: string;
    format: string; process_type: string; specification: string | null;
    variety: string | null; grade: string | null; organic: number;
    pack_size: string; unit_type: string; storage_type: string | null;
  } | undefined;

  if (!row) return undefined;

  const certs = db.prepare("SELECT certification FROM product_certifications WHERE product_id = ?")
    .all(row.id) as Array<{ certification: string }>;

  const listingRows = db.prepare("SELECT * FROM listings WHERE product_id = ? ORDER BY id")
    .all(row.id) as Array<{
      id: number; product_id: string; warehouse: string; city: string;
      state: string; supplier: string; country_of_origin: string;
      quantity: number; weight_lbs: number; arrived: string; min_bbd: string;
      unit_type: string | null; pack_detail: string | null;
    }>;

  const listings: Listing[] = listingRows.map((l) => {
    const contracts = db.prepare("SELECT contract FROM listing_contracts WHERE listing_id = ?")
      .all(l.id) as Array<{ contract: string }>;

    return {
      warehouse: l.warehouse,
      city: l.city,
      state: l.state,
      supplier: l.supplier,
      countryOfOrigin: l.country_of_origin,
      quantity: l.quantity,
      weightLbs: l.weight_lbs,
      arrived: l.arrived,
      minBBD: l.min_bbd,
      contracts: contracts.map((c) => c.contract),
      ...(l.unit_type != null && { unitType: l.unit_type }),
      ...(l.pack_detail != null && { packDetail: l.pack_detail }),
    };
  });

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
