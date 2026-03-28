import { getDb } from "./db";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ─────────────────────────────────────────────────────

export type DiscountReason =
  | "insurance-claim"
  | "expired"
  | "overstock"
  | "damaged"
  | "other";

export type DiscountStatus = "active" | "sold" | "missing";

export interface DiscountItem {
  id: string;
  productId: string | null;
  product: string;
  commodity: string;
  category: string;
  format: string;
  organic: boolean;
  packSize: string;
  unitType: string;
  warehouse: string;
  city: string;
  state: string;
  supplier: string;
  countryOfOrigin: string;
  quantity: number;
  weightLbs: number;
  lotNumber: string | null;
  contracts: string[];
  bbd: string | null;
  reason: DiscountReason;
  notes: string | null;
  askingPrice: string | null;
  status: DiscountStatus;
  addedDate: string;
  lastValidated: string | null;
}

export interface DiscountData {
  lastUpdated: string;
  items: DiscountItem[];
}

/** Fields required when adding a new discount item (id, status, dates are auto-set). */
export type DiscountItemInput = Omit<
  DiscountItem,
  "id" | "status" | "addedDate" | "lastValidated"
>;

// ─── Paths ─────────────────────────────────────────────────────

const DISCOUNT_JSON_PATH = join(process.cwd(), "data", "discount-inventory.json");

// ─── SQLite row shape ──────────────────────────────────────────

interface DiscountRow {
  id: string;
  product_id: string | null;
  product: string;
  commodity: string;
  category: string;
  format: string;
  organic: number;
  pack_size: string;
  unit_type: string;
  warehouse: string;
  city: string;
  state: string;
  supplier: string;
  country_of_origin: string;
  quantity: number;
  weight_lbs: number;
  lot_number: string | null;
  contracts: string | null;
  bbd: string | null;
  reason: string;
  notes: string | null;
  asking_price: string | null;
  status: string;
  added_date: string;
  last_validated: string | null;
}

function parseContracts(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToItem(row: DiscountRow): DiscountItem {
  return {
    id: row.id,
    productId: row.product_id,
    product: row.product,
    commodity: row.commodity,
    category: row.category,
    format: row.format,
    organic: row.organic === 1,
    packSize: row.pack_size,
    unitType: row.unit_type,
    warehouse: row.warehouse,
    city: row.city,
    state: row.state,
    supplier: row.supplier,
    countryOfOrigin: row.country_of_origin,
    quantity: row.quantity,
    weightLbs: row.weight_lbs,
    lotNumber: row.lot_number,
    contracts: parseContracts(row.contracts),
    bbd: row.bbd,
    reason: row.reason as DiscountReason,
    notes: row.notes,
    askingPrice: row.asking_price,
    status: row.status as DiscountStatus,
    addedDate: row.added_date,
    lastValidated: row.last_validated,
  };
}

// ─── ID generation ─────────────────────────────────────────────

export function getNextDiscountId(): string {
  const db = getDb();
  // Use MAX to find highest numeric suffix, handling gaps from deletions
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(id, 6) AS INTEGER)) as max_num
       FROM discount_items
       WHERE id LIKE 'disc-%'`,
    )
    .get() as { max_num: number | null } | undefined;

  const next = (row?.max_num ?? 0) + 1;
  return `disc-${String(next).padStart(3, "0")}`;
}

// ─── CRUD ──────────────────────────────────────────────────────

export function getDiscountItems(
  statusFilter: DiscountStatus | "all" = "active",
): DiscountItem[] {
  const db = getDb();
  const query =
    statusFilter === "all"
      ? "SELECT * FROM discount_items ORDER BY added_date DESC"
      : "SELECT * FROM discount_items WHERE status = ? ORDER BY added_date DESC";

  const rows =
    statusFilter === "all"
      ? (db.prepare(query).all() as DiscountRow[])
      : (db.prepare(query).all(statusFilter) as DiscountRow[]);

  return rows.map(rowToItem);
}

export function getDiscountItem(id: string): DiscountItem | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM discount_items WHERE id = ?")
    .get(id) as DiscountRow | undefined;
  return row ? rowToItem(row) : undefined;
}

export function addDiscountItem(input: DiscountItemInput): DiscountItem {
  const db = getDb();
  const id = getNextDiscountId();
  const today = new Date().toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO discount_items (
      id, product_id, product, commodity, category, format, organic,
      pack_size, unit_type, warehouse, city, state, supplier, country_of_origin,
      quantity, weight_lbs, lot_number, contracts, bbd,
      reason, notes, asking_price, status, added_date, last_validated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
  `).run(
    id,
    input.productId,
    input.product,
    input.commodity,
    input.category,
    input.format,
    input.organic ? 1 : 0,
    input.packSize,
    input.unitType,
    input.warehouse,
    input.city,
    input.state,
    input.supplier,
    input.countryOfOrigin,
    input.quantity,
    input.weightLbs,
    input.lotNumber,
    JSON.stringify(input.contracts || []),
    input.bbd,
    input.reason,
    input.notes,
    input.askingPrice,
    today,
  );

  // If this item has a lot number, immediately deduct from regular inventory
  if (input.lotNumber && input.productId) {
    deductDiscountLots();
  }
  syncDiscountToJson();
  return getDiscountItem(id)!;
}

/** Batch-create discount items by looking up lot data from current inventory. */
export interface LotDiscountInput {
  productId: string;
  lotNumber: string;
  reason: DiscountReason;
  notes: string | null;
  askingPrice: string | null;
}

export function addDiscountItemsFromLots(
  items: LotDiscountInput[],
): DiscountItem[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const createdIds: string[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO discount_items (
      id, product_id, product, commodity, category, format, organic,
      pack_size, unit_type, warehouse, city, state, supplier, country_of_origin,
      quantity, weight_lbs, lot_number, contracts, bbd,
      reason, notes, asking_price, status, added_date, last_validated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
  `);

  const batchInsert = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Guard: check if this lot is already in discount
      const existing = db.prepare(
        "SELECT id FROM discount_items WHERE product_id = ? AND lot_number = ? AND status = 'active'",
      ).get(item.productId, item.lotNumber) as { id: string } | undefined;

      if (existing) {
        throw new Error(`Lot ${item.lotNumber} is already in discount (${existing.id})`);
      }

      // Look up lot + contracts in a single query
      const lotRow = db.prepare(`
        SELECT l.id as lot_id, l.lot_number, l.quantity, l.weight_lbs, l.bbd,
               li.warehouse, li.city, li.state, li.supplier, li.country_of_origin,
               p.id as product_id, p.product, p.commodity, p.category, p.format,
               p.organic, p.pack_size, p.unit_type
        FROM lots l
        JOIN listings li ON l.listing_id = li.id
        JOIN products p ON li.product_id = p.id
        WHERE l.lot_number = ? AND p.id = ?
      `).get(item.lotNumber, item.productId) as {
        lot_id: number; lot_number: string; quantity: number; weight_lbs: number; bbd: string;
        warehouse: string; city: string; state: string; supplier: string; country_of_origin: string;
        product_id: string; product: string; commodity: string; category: string; format: string;
        organic: number; pack_size: string; unit_type: string;
      } | undefined;

      if (!lotRow) {
        throw new Error(`Item ${i + 1}: Lot "${item.lotNumber}" not found in inventory`);
      }

      // Get contracts using lot_id from the same query
      const contractRows = db.prepare(
        "SELECT contract FROM lot_contracts WHERE lot_id = ?",
      ).all(lotRow.lot_id) as Array<{ contract: string }>;
      const contracts = contractRows.map((c) => c.contract);

      const id = getNextDiscountId();

      insertStmt.run(
        id,
        lotRow.product_id, lotRow.product, lotRow.commodity, lotRow.category,
        lotRow.format, lotRow.organic, lotRow.pack_size, lotRow.unit_type,
        lotRow.warehouse, lotRow.city, lotRow.state, lotRow.supplier, lotRow.country_of_origin,
        lotRow.quantity, lotRow.weight_lbs, lotRow.lot_number,
        JSON.stringify(contracts), lotRow.bbd,
        item.reason, item.notes, item.askingPrice, today,
      );

      createdIds.push(id);
    }
  });

  batchInsert();
  // Immediately deduct the lots from regular inventory
  deductDiscountLots();
  syncDiscountToJson();
  return createdIds.map((id) => getDiscountItem(id)!);
}

export function updateDiscountItem(
  id: string,
  updates: Partial<Omit<DiscountItem, "id" | "addedDate">>,
): DiscountItem | undefined {
  const db = getDb();
  const existing = getDiscountItem(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.productId !== undefined) {
    fields.push("product_id = ?");
    values.push(updates.productId);
  }
  if (updates.product !== undefined) {
    fields.push("product = ?");
    values.push(updates.product);
  }
  if (updates.commodity !== undefined) {
    fields.push("commodity = ?");
    values.push(updates.commodity);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category);
  }
  if (updates.format !== undefined) {
    fields.push("format = ?");
    values.push(updates.format);
  }
  if (updates.organic !== undefined) {
    fields.push("organic = ?");
    values.push(updates.organic ? 1 : 0);
  }
  if (updates.packSize !== undefined) {
    fields.push("pack_size = ?");
    values.push(updates.packSize);
  }
  if (updates.unitType !== undefined) {
    fields.push("unit_type = ?");
    values.push(updates.unitType);
  }
  if (updates.warehouse !== undefined) {
    fields.push("warehouse = ?");
    values.push(updates.warehouse);
  }
  if (updates.city !== undefined) {
    fields.push("city = ?");
    values.push(updates.city);
  }
  if (updates.state !== undefined) {
    fields.push("state = ?");
    values.push(updates.state);
  }
  if (updates.supplier !== undefined) {
    fields.push("supplier = ?");
    values.push(updates.supplier);
  }
  if (updates.countryOfOrigin !== undefined) {
    fields.push("country_of_origin = ?");
    values.push(updates.countryOfOrigin);
  }
  if (updates.quantity !== undefined) {
    fields.push("quantity = ?");
    values.push(updates.quantity);
  }
  if (updates.weightLbs !== undefined) {
    fields.push("weight_lbs = ?");
    values.push(updates.weightLbs);
  }
  if (updates.lotNumber !== undefined) {
    fields.push("lot_number = ?");
    values.push(updates.lotNumber);
  }
  if (updates.contracts !== undefined) {
    fields.push("contracts = ?");
    values.push(JSON.stringify(updates.contracts));
  }
  if (updates.bbd !== undefined) {
    fields.push("bbd = ?");
    values.push(updates.bbd);
  }
  if (updates.reason !== undefined) {
    fields.push("reason = ?");
    values.push(updates.reason);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes);
  }
  if (updates.askingPrice !== undefined) {
    fields.push("asking_price = ?");
    values.push(updates.askingPrice);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.lastValidated !== undefined) {
    fields.push("last_validated = ?");
    values.push(updates.lastValidated);
  }

  if (fields.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE discount_items SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
  );

  syncDiscountToJson();
  return getDiscountItem(id);
}

export function removeDiscountItem(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE discount_items SET status = 'sold' WHERE id = ?")
    .run(id);
  if (result.changes > 0) syncDiscountToJson();
  return result.changes > 0;
}

/** Permanently delete a discount item and restore its lot to regular inventory immediately. */
export function restoreToInventory(id: string): boolean {
  const db = getDb();

  const item = getDiscountItem(id);
  if (!item) return false;

  // Wrap deletion + restoration in a single transaction so both succeed or both fail
  const restore = db.transaction(() => {
    db.prepare("DELETE FROM discount_items WHERE id = ?").run(id);

    // If it had a lot number, restore the lot from inventory.json
    if (item.lotNumber && item.productId) {
      const inventoryPath = join(process.cwd(), "data", "inventory.json");
      if (!existsSync(inventoryPath)) return;

      let inventory: { products?: Array<any> };
      try {
        inventory = JSON.parse(readFileSync(inventoryPath, "utf-8"));
      } catch {
        return; // Can't parse — lot will come back on next sync
      }

      if (!Array.isArray(inventory.products)) return;

      const product = inventory.products.find((p: any) => p.id === item.productId);
      if (!product || !Array.isArray(product.listings)) return;

      const listing = product.listings.find(
        (l: any) => l.warehouse === item.warehouse && l.supplier === item.supplier,
      );
      if (!listing || !Array.isArray(listing.lots)) return;

      const lotData = listing.lots.find(
        (lot: any) => lot.lotNumber === item.lotNumber,
      );
      if (!lotData) return;

      // Validate lot data has required numeric fields
      const qty = Number(lotData.quantity);
      const weight = Number(lotData.weightLbs);
      if (!Number.isFinite(qty) || !Number.isFinite(weight)) return;

      // Ensure listing exists in DB
      let dbListing = db.prepare(
        "SELECT id FROM listings WHERE product_id = ? AND warehouse = ? AND supplier = ?",
      ).get(item.productId, item.warehouse, item.supplier) as { id: number } | undefined;

      if (!dbListing) {
        const insertResult = db.prepare(`
          INSERT INTO listings (product_id, warehouse, city, state, supplier, country_of_origin, quantity, weight_lbs, arrived, min_bbd)
          VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `).run(
          item.productId, item.warehouse, item.city, item.state,
          item.supplier, item.countryOfOrigin,
          listing.arrived || "", listing.minBBD || "",
        );
        dbListing = { id: Number(insertResult.lastInsertRowid) };
      }

      // Insert the lot (skip if already exists)
      const lotResult = db.prepare(
        "INSERT OR IGNORE INTO lots (listing_id, lot_number, quantity, weight_lbs, bbd) VALUES (?, ?, ?, ?, ?)",
      ).run(dbListing.id, lotData.lotNumber, qty, weight, lotData.bbd || "");

      if (lotResult.changes > 0) {
        const lotId = Number(lotResult.lastInsertRowid);
        const insertLotContract = db.prepare(
          "INSERT OR IGNORE INTO lot_contracts (lot_id, contract) VALUES (?, ?)",
        );
        for (const c of Array.isArray(lotData.contracts) ? lotData.contracts : []) {
          if (typeof c === "string") insertLotContract.run(lotId, c);
        }
        db.prepare(
          "UPDATE listings SET quantity = quantity + ?, weight_lbs = weight_lbs + ? WHERE id = ?",
        ).run(qty, weight, dbListing.id);
      }
    }
  });

  restore();
  syncDiscountToJson();
  return true;
}

// ─── JSON sync ─────────────────────────────────────────────────

export function syncDiscountToJson(): void {
  const items = getDiscountItems("all");
  const data: DiscountData = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    items,
  };
  writeFileSync(DISCOUNT_JSON_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function loadDiscountFromJson(): number {
  if (!existsSync(DISCOUNT_JSON_PATH)) return 0;

  let data: DiscountData;
  try {
    data = JSON.parse(readFileSync(DISCOUNT_JSON_PATH, "utf-8"));
  } catch {
    return 0;
  }

  if (!Array.isArray(data.items) || data.items.length === 0) return 0;

  const db = getDb();
  db.exec("DELETE FROM discount_items");

  const insert = db.prepare(`
    INSERT INTO discount_items (
      id, product_id, product, commodity, category, format, organic,
      pack_size, unit_type, warehouse, city, state, supplier, country_of_origin,
      quantity, weight_lbs, lot_number, contracts, bbd,
      reason, notes, asking_price, status, added_date, last_validated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const item of data.items) {
      insert.run(
        item.id,
        item.productId,
        item.product,
        item.commodity,
        item.category,
        item.format,
        item.organic ? 1 : 0,
        item.packSize,
        item.unitType,
        item.warehouse,
        item.city,
        item.state,
        item.supplier,
        item.countryOfOrigin,
        item.quantity,
        item.weightLbs,
        item.lotNumber,
        JSON.stringify(item.contracts || []),
        item.bbd,
        item.reason,
        item.notes,
        item.askingPrice,
        item.status,
        item.addedDate,
        item.lastValidated,
      );
    }
  });

  seedAll();
  return data.items.length;
}

// ─── Lot deduction (post-sync) ─────────────────────────────────

export interface DeductionReport {
  lotsRemoved: number;
  listingsEmptied: number;
  productsRemoved: number;
  missing: number;
  details: Array<{
    id: string;
    product: string;
    lotNumber: string;
    action: "deducted" | "missing";
    note: string;
  }>;
}

/**
 * Remove discount-claimed lots from regular inventory in SQLite.
 * Called after the main sync/seed populates all inventory tables.
 * For each active discount item with productId + lotNumber:
 *   - Find and delete the matching lot from the lots table
 *   - Subtract its qty/weight from the parent listing
 *   - Remove empty listings and products
 */
export function deductDiscountLots(): DeductionReport {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const report: DeductionReport = {
    lotsRemoved: 0,
    listingsEmptied: 0,
    productsRemoved: 0,
    missing: 0,
    details: [],
  };

  const deduct = db.transaction(() => {
    // Read active items inside the transaction for consistency
    const activeItems = getDiscountItems("active").filter(
      (i) => i.productId && i.lotNumber,
    );

    if (activeItems.length === 0) return;
    for (const item of activeItems) {
      // Find the lot in regular inventory
      const lot = db
        .prepare(
          `SELECT l.id, l.listing_id, l.quantity, l.weight_lbs
           FROM lots l
           JOIN listings li ON l.listing_id = li.id
           WHERE l.lot_number = ? AND li.product_id = ?`,
        )
        .get(item.lotNumber, item.productId) as
        | { id: number; listing_id: number; quantity: number; weight_lbs: number }
        | undefined;

      if (!lot) {
        // Lot not in this week's ERP — flag as missing
        db.prepare(
          "UPDATE discount_items SET status = 'missing', last_validated = ? WHERE id = ?",
        ).run(today, item.id);
        report.missing++;
        report.details.push({
          id: item.id,
          product: item.product,
          lotNumber: item.lotNumber!,
          action: "missing",
          note: `Lot ${item.lotNumber} not found in product ${item.productId}`,
        });
        continue;
      }

      // Delete lot contracts
      db.prepare("DELETE FROM lot_contracts WHERE lot_id = ?").run(lot.id);

      // Delete document_lots links (documents themselves are preserved)
      db.prepare("DELETE FROM document_lots WHERE lot_id = ?").run(lot.id);

      // Delete the lot
      db.prepare("DELETE FROM lots WHERE id = ?").run(lot.id);
      report.lotsRemoved++;

      // Subtract from parent listing
      db.prepare(
        "UPDATE listings SET quantity = quantity - ?, weight_lbs = weight_lbs - ? WHERE id = ?",
      ).run(lot.quantity, lot.weight_lbs, lot.listing_id);

      // Check if listing is now empty
      const remainingLots = db
        .prepare("SELECT COUNT(*) as cnt FROM lots WHERE listing_id = ?")
        .get(lot.listing_id) as { cnt: number };
      const listingState = db
        .prepare("SELECT quantity, product_id FROM listings WHERE id = ?")
        .get(lot.listing_id) as { quantity: number; product_id: string };

      if (remainingLots.cnt === 0 && listingState.quantity <= 0) {
        // Remove empty listing
        db.prepare("DELETE FROM listing_contracts WHERE listing_id = ?").run(
          lot.listing_id,
        );
        db.prepare("DELETE FROM listings WHERE id = ?").run(lot.listing_id);
        report.listingsEmptied++;

        // Check if product has any remaining listings
        const remainingListings = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM listings WHERE product_id = ?",
          )
          .get(listingState.product_id) as { cnt: number };

        if (remainingListings.cnt === 0) {
          // Check if documents reference this product — if so, leave product
          // as a stub (documents are preserved across syncs, can't delete product with FK)
          const docCount = db
            .prepare(
              "SELECT COUNT(*) as cnt FROM documents WHERE product_id = ?",
            )
            .get(listingState.product_id) as { cnt: number };

          db.prepare(
            "DELETE FROM product_certifications WHERE product_id = ?",
          ).run(listingState.product_id);

          if (docCount.cnt === 0) {
            db.prepare("DELETE FROM products WHERE id = ?").run(
              listingState.product_id,
            );
          }
          report.productsRemoved++;
        }
      }

      // Mark discount item as validated
      db.prepare(
        "UPDATE discount_items SET last_validated = ? WHERE id = ?",
      ).run(today, item.id);

      report.details.push({
        id: item.id,
        product: item.product,
        lotNumber: item.lotNumber!,
        action: "deducted",
        note: `Lot ${item.lotNumber} removed (${lot.quantity} ${item.unitType}, ${Math.round(lot.weight_lbs).toLocaleString()} lbs)`,
      });
    }
  });

  deduct();
  syncDiscountToJson();
  return report;
}

// ─── Validation (post-sync) ────────────────────────────────────

export interface ValidationReport {
  validated: number;
  missing: number;
  overlaps: string[];
  details: Array<{
    id: string;
    product: string;
    action: "validated" | "missing" | "overlap";
    note: string;
  }>;
}

export function validateDiscountItems(
  currentProducts: Array<{
    id: string;
    product: string;
    listings: Array<{ warehouse: string; supplier: string }>;
  }>,
): ValidationReport {
  const db = getDb();
  const activeItems = getDiscountItems("active");
  const today = new Date().toISOString().slice(0, 10);

  const report: ValidationReport = {
    validated: 0,
    missing: 0,
    overlaps: [],
    details: [],
  };

  if (activeItems.length === 0) return report;

  // Build lookup maps
  const productById = new Map(currentProducts.map((p) => [p.id, p]));
  const productByName = new Map(
    currentProducts.map((p) => [p.product.toLowerCase(), p]),
  );

  for (const item of activeItems) {
    // Items with lot numbers are handled by deductDiscountLots() — skip here
    if (item.productId && item.lotNumber) {
      continue;
    }

    if (item.productId) {
      // Linked item without lot number — check if product + listing still exist
      const product = productById.get(item.productId);
      if (product) {
        const hasListing = product.listings.some(
          (l) =>
            l.warehouse === item.warehouse && l.supplier === item.supplier,
        );

        if (hasListing) {
          db.prepare(
            "UPDATE discount_items SET last_validated = ? WHERE id = ?",
          ).run(today, item.id);
          report.validated++;
          report.details.push({
            id: item.id,
            product: item.product,
            action: "validated",
            note: `Stock still present at ${item.warehouse}`,
          });
        } else {
          db.prepare(
            "UPDATE discount_items SET status = 'missing', last_validated = ? WHERE id = ?",
          ).run(today, item.id);
          report.missing++;
          report.details.push({
            id: item.id,
            product: item.product,
            action: "missing",
            note: `Product exists but no listing at ${item.warehouse} / ${item.supplier}`,
          });
        }
      } else {
        db.prepare(
          "UPDATE discount_items SET status = 'missing', last_validated = ? WHERE id = ?",
        ).run(today, item.id);
        report.missing++;
        report.details.push({
          id: item.id,
          product: item.product,
          action: "missing",
          note: `Product ${item.productId} no longer in inventory`,
        });
      }
    } else {
      // Standalone item — check for overlap with regular inventory
      const match = productByName.get(item.product.toLowerCase());
      if (match) {
        const hasListing = match.listings.some(
          (l) =>
            l.warehouse === item.warehouse && l.supplier === item.supplier,
        );
        if (hasListing) {
          report.overlaps.push(item.id);
          report.details.push({
            id: item.id,
            product: item.product,
            action: "overlap",
            note: `May overlap with regular inventory product "${match.product}" at ${item.warehouse}`,
          });
        }
      }
      // Standalone items not expected in ERP — leave as-is
      db.prepare(
        "UPDATE discount_items SET last_validated = ? WHERE id = ?",
      ).run(today, item.id);
      report.validated++;
    }
  }

  syncDiscountToJson();
  return report;
}
