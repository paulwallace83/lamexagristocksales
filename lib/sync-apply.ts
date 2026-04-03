/**
 * lib/sync-apply.ts — Reusable sync-apply pipeline.
 *
 * Extracts the full sync logic from scripts/sync-inventory.ts into a
 * library function that can be called from both the CLI and route handlers.
 *
 * applySync() is silent (no console output) and never calls process.exit().
 * It returns a structured SyncApplyResult or throws on unrecoverable failure.
 * A file-based mutex (data/.sync-lock) prevents concurrent syncs.
 *
 * ⚠️  API callers: Error messages may contain internal file paths. When
 * exposing errors via HTTP responses, return a generic message to the client
 * and log the original error server-side. Never pass err.message directly
 * to the response body.
 */

import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  statSync,
  openSync,
  closeSync,
  constants,
} from "fs";
import { join } from "path";
import { getDb } from "./db";
import { exportCoaData, relinkCoaData } from "./coa-data";
import { relinkDocumentLots } from "./documents";
import { setNewArrivals } from "./product-flags";
import {
  deductDiscountLots,
  validateDiscountItems,
  getDiscountItems,
  type DeductionReport,
  type ValidationReport,
} from "./discount";

// ─── Types ──────────────────────────────────────────────────────

export interface SyncApplyOptions {
  proposedPath: string;
  inventoryPath: string;
  dataDir: string;
  /** Project root for reference file output (suppliers.md, warehouses.md). Defaults to process.cwd(). */
  rootDir?: string;
}

// TODO: When exposing SyncApplyResult via API, consider whether originalName (user-supplied filename) should be sanitised
export interface OrphanedDoc {
  id: string;
  productId: string;
  originalName: string;
}

export interface SyncApplyResult {
  snapshotPath: string;
  productCount: number;
  listingCount: number;
  contractCount: number;
  lotCount: number;
  warehouseCount: number;
  supplierCount: number;
  documentsPreserved: number;
  orphanedDocs: OrphanedDoc[];
  relinkReport: { linked: number; orphaned: number };
  coaRelinkReport: { linked: number; orphaned: number };
  deductionReport: DeductionReport;
  validationReport: ValidationReport | null;
  newArrivals: string[];
  cleanedUp: boolean;
  referenceFilesRegenerated: boolean;
}

// ─── Lock ───────────────────────────────────────────────────────

function lockPath(dataDir: string): string {
  return join(dataDir, ".sync-lock");
}

function acquireLock(dataDir: string): void {
  const lp = lockPath(dataDir);
  try {
    const fd = openSync(lp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
    closeSync(fd);
  } catch (err: any) {
    if (err.code === "EEXIST") throw new Error("Sync already in progress");
    throw err;
  }
}

function releaseLock(dataDir: string): void {
  const lp = lockPath(dataDir);
  try {
    unlinkSync(lp);
  } catch {
    // Lock already removed — not an error
  }
}

// ─── Helpers ────────────────────────────────────────────────────

// TODO: readJson returns `any` — consider using a generic or discriminated union for better type safety
function readJson(filepath: string): any {
  let raw: string;
  try {
    raw = readFileSync(filepath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`File not found: ${filepath}`);
    }
    throw new Error(`Cannot read file: ${filepath} — ${err.message ?? err}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${filepath} — ${msg}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────

export function applySync(options: SyncApplyOptions): SyncApplyResult {
  const { proposedPath, inventoryPath, dataDir, rootDir = process.cwd() } = options;
  const snapshotDir = join(dataDir, "snapshots");

  // ── Lock ────────────────────────────────────────────────────
  acquireLock(dataDir);

  try {
    // ── Preflight ───────────────────────────────────────────
    if (!existsSync(proposedPath)) {
      throw new Error(
        "No proposed inventory found at inventory-proposed.json. " +
          "Run the diff step first, then write the approved data to that file."
      );
    }
    if (!existsSync(inventoryPath)) {
      throw new Error("No current inventory found at inventory.json");
    }

    const inventory = readJson(proposedPath);
    const suppliers = readJson(join(dataDir, "suppliers.json"));
    const warehouses = readJson(join(dataDir, "warehouses.json"));

    if (!Array.isArray(inventory.products)) {
      throw new Error("inventory-proposed.json missing 'products' array");
    }
    if (!Array.isArray(suppliers.suppliers)) {
      throw new Error("suppliers.json missing 'suppliers' array");
    }
    if (!Array.isArray(warehouses.warehouses)) {
      throw new Error("warehouses.json missing 'warehouses' array");
    }

    // ── Snapshot ────────────────────────────────────────────
    if (!existsSync(snapshotDir)) {
      mkdirSync(snapshotDir, { recursive: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    let snapshotName = `inventory-${today}.json`;
    let snapshotPath = join(snapshotDir, snapshotName);

    let seq = 1;
    while (existsSync(snapshotPath)) {
      seq++;
      snapshotName = `inventory-${today}-${seq}.json`;
      snapshotPath = join(snapshotDir, snapshotName);
    }

    try {
      copyFileSync(inventoryPath, snapshotPath);
      const snapStat = statSync(snapshotPath);
      if (snapStat.size === 0) {
        throw new Error("Snapshot file is empty after copy");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create snapshot: ${msg}`);
    }

    // ── Apply proposed → inventory.json ─────────────────────
    try {
      copyFileSync(proposedPath, inventoryPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Attempt rollback from snapshot
      try {
        copyFileSync(snapshotPath, inventoryPath);
      } catch {
        throw new Error(
          `Failed to update inventory.json: ${msg}. ` +
            `CRITICAL: Could not restore from snapshot. Manual recovery needed from ${snapshotName}.`
        );
      }
      throw new Error(
        `Failed to update inventory.json: ${msg}. Restored from snapshot ${snapshotName}.`
      );
    }

    // ── Document-preserving seed ────────────────────────────
    const db = getDb();

    const savedCoaData = exportCoaData();

    db.exec("PRAGMA foreign_keys = OFF");

    let productCount = 0;
    let listingCount = 0;
    let contractCount = 0;
    let lotCount = 0;
    let documentsPreserved = 0;
    let orphanedDocs: OrphanedDoc[] = [];

    try {
      const seedInventory = db.transaction(() => {
        db.exec("DELETE FROM coa_data");
        db.exec("DELETE FROM document_lots");

        db.exec(`
          DELETE FROM lot_contracts;
          DELETE FROM lots;
          DELETE FROM listing_contracts;
          DELETE FROM listings;
          DELETE FROM product_certifications;
          DELETE FROM supplier_products;
          DELETE FROM products;
          DELETE FROM suppliers;
          DELETE FROM warehouses;
          DELETE FROM metadata;
        `);

        // Metadata
        const insertMeta = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
        insertMeta.run("lastUpdated", inventory.lastUpdated || today);

        // Warehouses
        const insertWarehouse = db.prepare(
          "INSERT INTO warehouses (id, name, city, state, storage_type) VALUES (?, ?, ?, ?, ?)"
        );
        for (const w of warehouses.warehouses) {
          insertWarehouse.run(w.id, w.name, w.city, w.state, w.storageType);
        }

        // Suppliers
        const insertSupplier = db.prepare(
          "INSERT INTO suppliers (id, name, country_of_origin, trading_company, display_name, note) VALUES (?, ?, ?, ?, ?, ?)"
        );
        const insertSupplierProduct = db.prepare(
          "INSERT INTO supplier_products (supplier_id, product_label) VALUES (?, ?)"
        );
        for (const s of suppliers.suppliers) {
          insertSupplier.run(
            s.id,
            s.name,
            s.countryOfOrigin,
            s.tradingCompany ? 1 : 0,
            s.displayName ?? null,
            s.note ?? null
          );
          for (const p of s.products || []) {
            insertSupplierProduct.run(s.id, p);
          }
        }

        // Products + certifications + listings + contracts
        const insertProduct = db.prepare(`
          INSERT INTO products (id, product, commodity, category, format, process_type, specification, variety, grade, organic, pack_size, unit_type, storage_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertCert = db.prepare(
          "INSERT INTO product_certifications (product_id, certification) VALUES (?, ?)"
        );
        const insertListing = db.prepare(`
          INSERT INTO listings (product_id, warehouse, city, state, supplier, country_of_origin, quantity, weight_lbs, arrived, min_bbd, unit_type, pack_detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertContract = db.prepare(
          "INSERT INTO listing_contracts (listing_id, contract) VALUES (?, ?)"
        );
        const insertLot = db.prepare(
          "INSERT INTO lots (listing_id, lot_number, quantity, weight_lbs, bbd) VALUES (?, ?, ?, ?, ?)"
        );
        const findLot = db.prepare(
          "SELECT id FROM lots WHERE listing_id = ? AND lot_number = ?"
        );
        const updateLot = db.prepare(
          "UPDATE lots SET quantity = quantity + ?, weight_lbs = weight_lbs + ? WHERE id = ?"
        );
        const insertLotContract = db.prepare(
          "INSERT OR IGNORE INTO lot_contracts (lot_id, contract) VALUES (?, ?)"
        );

        for (const p of inventory.products) {
          insertProduct.run(
            p.id,
            p.product,
            p.commodity,
            p.category,
            p.format,
            p.processType,
            p.specification ?? null,
            p.variety ?? null,
            p.grade ?? null,
            p.organic ? 1 : 0,
            p.packSize,
            p.unitType,
            p.storageType ?? null
          );

          for (const cert of p.certifications || []) {
            insertCert.run(p.id, cert);
          }

          for (const l of p.listings || []) {
            const result = insertListing.run(
              p.id,
              l.warehouse,
              l.city,
              l.state,
              l.supplier,
              l.countryOfOrigin,
              l.quantity,
              l.weightLbs,
              l.arrived,
              l.minBBD,
              l.unitType ?? null,
              l.packDetail ?? null
            );
            listingCount++;

            const listingId = Number(result.lastInsertRowid);

            for (const c of l.contracts || []) {
              insertContract.run(listingId, c);
              contractCount++;
            }

            for (const lot of l.lots || []) {
              const existing = findLot.get(listingId, lot.lotNumber) as
                | { id: number }
                | undefined;
              let lotId: number;
              if (existing) {
                lotId = existing.id;
                updateLot.run(lot.quantity, lot.weightLbs, lotId);
              } else {
                const lotResult = insertLot.run(
                  listingId,
                  lot.lotNumber,
                  lot.quantity,
                  lot.weightLbs,
                  lot.bbd ?? null
                );
                lotId = Number(lotResult.lastInsertRowid);
              }
              for (const c of lot.contracts || []) {
                insertLotContract.run(lotId, c);
              }
              lotCount++;
            }
          }
        }

        productCount = inventory.products.length;

        const rawOrphans = db
          .prepare(
            `SELECT d.id, d.product_id, d.original_name
             FROM documents d
             LEFT JOIN products p ON d.product_id = p.id
             WHERE p.id IS NULL`
          )
          .all() as Array<{ id: string; product_id: string; original_name: string }>;
        orphanedDocs = rawOrphans.map((d) => ({
          id: d.id,
          productId: d.product_id,
          originalName: d.original_name,
        }));

        documentsPreserved = (
          db.prepare("SELECT count(*) as n FROM documents").get() as { n: number }
        ).n;
      });

      seedInventory();
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }

    // ── Re-link document ↔ lot associations ─────────────────
    const relinkReport = relinkDocumentLots();

    // ── Re-link COA data ────────────────────────────────────
    const coaRelinkReport =
      savedCoaData.length > 0 ? relinkCoaData(savedCoaData) : { linked: 0, orphaned: 0 };

    // ── Auto-detect new arrivals ────────────────────────────
    let newArrivals: string[] = [];
    try {
      const snapshot = readJson(snapshotPath);
      const previousIds = new Set<string>(
        (snapshot.products || []).map((p: { id: string }) => p.id)
      );
      newArrivals = inventory.products
        .map((p: { id: string }) => p.id)
        .filter((id: string) => !previousIds.has(id));
    } catch {
      // Non-fatal — snapshot comparison failed, skip new arrival detection
      newArrivals = [];
    }
    // Flag detected arrivals (separate try — don't lose detection data on DB error)
    try {
      if (newArrivals.length > 0) setNewArrivals(newArrivals);
    } catch {
      // Non-fatal — arrivals detected but not flagged in DB
    }

    // ── Regenerate reference markdown files ──────────────────
    // Errors propagate — sync data is committed, so a write failure (disk full,
    // permission denied) should be immediately visible to the operator.
    regenerateSuppliersMd(suppliers.suppliers, today, rootDir);
    regenerateWarehousesMd(warehouses.warehouses, today, rootDir);
    const referenceFilesRegenerated = true;

    // ── Deduct discount lots ────────────────────────────────
    const deductionReport = deductDiscountLots();

    // ── Validate remaining discount items ───────────────────
    let validationReport: ValidationReport | null = null;
    const activeDiscountItems = getDiscountItems("active");
    if (activeDiscountItems.length > 0) {
      const currentProducts = inventory.products.map((p: any) => ({
        id: p.id,
        product: p.product,
        listings: (p.listings || []).map((l: any) => ({
          warehouse: l.warehouse,
          supplier: l.supplier,
        })),
      }));
      validationReport = validateDiscountItems(currentProducts);
    }

    // ── Cleanup ─────────────────────────────────────────────
    let cleanedUp = false;
    try {
      unlinkSync(proposedPath);
      cleanedUp = true;
    } catch {
      // Non-fatal — user can clean up manually
    }

    return {
      snapshotPath,
      productCount,
      listingCount,
      contractCount,
      lotCount,
      warehouseCount: warehouses.warehouses.length,
      supplierCount: suppliers.suppliers.length,
      documentsPreserved,
      orphanedDocs,
      relinkReport,
      coaRelinkReport,
      deductionReport,
      validationReport,
      newArrivals,
      cleanedUp,
      referenceFilesRegenerated,
    };
  } finally {
    releaseLock(dataDir);
  }
}

// ─── Reference file generators ──────────────────────────────────

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function regenerateSuppliersMd(
  supplierList: Array<{
    name: string;
    countryOfOrigin: string;
    products?: string[];
    tradingCompany?: boolean;
    displayName?: string;
  }>,
  today: string,
  rootDir: string
): void {
  const lines: string[] = [
    "# Suppliers",
    "",
    "Master list of all suppliers with country of origin and products.",
    "Auto-generated by sync — do not edit manually.",
    "",
    "| Supplier | Country of Origin | Products | Trading Company |",
    "|----------|------------------|----------|-----------------|",
  ];

  for (const s of supplierList) {
    const tc = s.tradingCompany ? `Yes (display as "${s.displayName || "Various"}")` : "No";
    const products = Array.isArray(s.products) ? s.products.map(escapeMd).join(", ") : "";
    lines.push(`| ${escapeMd(s.name)} | ${escapeMd(s.countryOfOrigin)} | ${products} | ${tc} |`);
  }

  lines.push("");
  lines.push(`_${supplierList.length} suppliers — Last updated: ${today}_`);

  writeFileSync(join(rootDir, "suppliers.md"), lines.join("\n") + "\n");
}

function regenerateWarehousesMd(
  warehouseList: Array<{
    name: string;
    city: string;
    state: string;
    storageType: string;
  }>,
  today: string,
  rootDir: string
): void {
  const lines: string[] = [
    "# Warehouses",
    "",
    "Master list of all warehouse locations with city and state.",
    "Auto-generated by sync — do not edit manually.",
    "",
    "| Warehouse | City | State | Storage Type |",
    "|-----------|------|-------|-------------|",
  ];

  for (const w of warehouseList) {
    lines.push(`| ${escapeMd(w.name)} | ${escapeMd(w.city)} | ${escapeMd(w.state)} | ${escapeMd(w.storageType)} |`);
  }

  lines.push("");
  lines.push(`_${warehouseList.length} warehouses — Last updated: ${today}_`);

  writeFileSync(join(rootDir, "warehouses.md"), lines.join("\n") + "\n");
}
