/**
 * scripts/sync-inventory.ts — Apply an approved inventory sync
 *
 * Usage: npx tsx scripts/sync-inventory.ts
 *
 * Expects data/inventory-proposed.json to exist (written by Claude after diff approval).
 *
 * Steps:
 * 1. Preflight: validate all JSON files parse correctly
 * 2. Snapshot current inventory.json → data/snapshots/inventory-YYYY-MM-DD.json
 * 3. Overwrite inventory.json with proposed data
 * 4. Re-seed SQLite (preserving documents + users)
 * 5. Regenerate suppliers.md and warehouses.md
 * 6. Clean up proposed file
 *
 * Safety:
 * - PRAGMA foreign_keys is always restored via try/finally
 * - document_lots orphans are cleaned up when lots are deleted
 * - File operations are validated before proceeding
 * - All JSON is parsed in preflight before any mutations
 */

import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  statSync,
} from "fs";
import { join } from "path";
import { getDb } from "../lib/db";

const dataDir = join(process.cwd(), "data");
const snapshotDir = join(dataDir, "snapshots");
const proposedPath = join(dataDir, "inventory-proposed.json");
const inventoryPath = join(dataDir, "inventory.json");

// ─── Helpers ─────────────────────────────────────────────────────

function readJson(filepath: string) {
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to parse JSON: ${filepath}`);
    console.error(`   ${msg}`);
    process.exit(1);
  }
}

// ─── Preflight checks ────────────────────────────────────────────

if (!existsSync(proposedPath)) {
  console.error("❌ No proposed inventory found at data/inventory-proposed.json");
  console.error("   Run the diff step first, then write the approved data to that file.");
  process.exit(1);
}

if (!existsSync(inventoryPath)) {
  console.error("❌ No current inventory found at data/inventory.json");
  process.exit(1);
}

// Parse all JSON upfront — fail fast before any mutations
console.log("🔍 Preflight: validating JSON files...");
const inventory = readJson(proposedPath);
const suppliers = readJson(join(dataDir, "suppliers.json"));
const warehouses = readJson(join(dataDir, "warehouses.json"));

if (!Array.isArray(inventory.products)) {
  console.error("❌ inventory-proposed.json missing 'products' array");
  process.exit(1);
}
if (!Array.isArray(suppliers.suppliers)) {
  console.error("❌ suppliers.json missing 'suppliers' array");
  process.exit(1);
}
if (!Array.isArray(warehouses.warehouses)) {
  console.error("❌ warehouses.json missing 'warehouses' array");
  process.exit(1);
}
console.log("   ✅ All JSON files valid");

// ─── Step 1: Snapshot ────────────────────────────────────────────

if (!existsSync(snapshotDir)) {
  mkdirSync(snapshotDir, { recursive: true });
}

const today = new Date().toISOString().slice(0, 10);
let snapshotName = `inventory-${today}.json`;
let snapshotPath = join(snapshotDir, snapshotName);

// Handle multiple syncs per day
let seq = 1;
while (existsSync(snapshotPath)) {
  seq++;
  snapshotName = `inventory-${today}-${seq}.json`;
  snapshotPath = join(snapshotDir, snapshotName);
}

try {
  copyFileSync(inventoryPath, snapshotPath);
  // Verify snapshot was written
  const snapStat = statSync(snapshotPath);
  if (snapStat.size === 0) {
    throw new Error("Snapshot file is empty after copy");
  }
  console.log(`📸 Snapshot saved: data/snapshots/${snapshotName} (${snapStat.size} bytes)`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`❌ Failed to create snapshot: ${msg}`);
  console.error("   Aborting sync to protect current inventory data.");
  process.exit(1);
}

// ─── Step 2: Apply proposed → inventory.json ─────────────────────

try {
  copyFileSync(proposedPath, inventoryPath);
  console.log("✅ inventory.json updated with proposed data");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`❌ Failed to update inventory.json: ${msg}`);
  console.error(`   Restoring from snapshot: data/snapshots/${snapshotName}`);
  try {
    copyFileSync(snapshotPath, inventoryPath);
    console.error("   ✅ Restored inventory.json from snapshot");
  } catch {
    console.error("   ❌ CRITICAL: Could not restore inventory.json. Manual recovery needed from snapshot.");
  }
  process.exit(1);
}

// ─── Step 3: Document-preserving seed ────────────────────────────

const db = getDb();

// PRAGMA foreign_keys must be set outside transactions.
// Use try/finally to GUARANTEE it's re-enabled even on crash.
db.exec("PRAGMA foreign_keys = OFF");

try {
  const seedInventory = db.transaction(() => {
    // Clean up document_lots that reference lots about to be deleted.
    // This preserves the documents themselves but removes stale lot associations.
    db.exec("DELETE FROM document_lots");

    // Clear only inventory tables (preserve documents, users)
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

    let totalListings = 0;
    let totalContracts = 0;

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
        totalListings++;

        for (const c of l.contracts || []) {
          insertContract.run(Number(result.lastInsertRowid), c);
          totalContracts++;
        }
      }
    }

    // Check for orphaned documents (product removed but documents remain)
    const orphanedDocs = db
      .prepare(
        `SELECT d.id, d.product_id, d.original_name
         FROM documents d
         LEFT JOIN products p ON d.product_id = p.id
         WHERE p.id IS NULL`
      )
      .all() as Array<{ id: string; product_id: string; original_name: string }>;

    console.log(`\n🔄 SQLite re-seeded (documents + users preserved):`);
    console.log(`   ${inventory.products.length} products`);
    console.log(`   ${totalListings} listings`);
    console.log(`   ${totalContracts} contracts`);
    console.log(`   ${warehouses.warehouses.length} warehouses`);
    console.log(`   ${suppliers.suppliers.length} suppliers`);

    const docCount = (db.prepare("SELECT count(*) as n FROM documents").get() as { n: number }).n;
    console.log(`   ${docCount} documents preserved`);

    if (orphanedDocs.length > 0) {
      console.log(`\n⚠️  ${orphanedDocs.length} orphaned document(s) (product removed but files preserved):`);
      for (const doc of orphanedDocs) {
        console.log(`   - "${doc.original_name}" → product ${doc.product_id}`);
      }
    }
  });

  seedInventory();
} finally {
  // ALWAYS re-enable FK checks, even if transaction threw
  db.exec("PRAGMA foreign_keys = ON");
}

// ─── Step 4: Regenerate reference markdown files ─────────────────

function regenerateSuppliersMd() {
  const lines: string[] = [
    "# Suppliers",
    "",
    "Master list of all suppliers with country of origin and products.",
    "Auto-generated by sync — do not edit manually.",
    "",
    "| Supplier | Country of Origin | Products | Trading Company |",
    "|----------|------------------|----------|-----------------|",
  ];

  for (const s of suppliers.suppliers) {
    const tc = s.tradingCompany ? `Yes (display as "${s.displayName || "Various"}")` : "No";
    const products = Array.isArray(s.products) ? s.products.join(", ") : "";
    lines.push(`| ${s.name} | ${s.countryOfOrigin} | ${products} | ${tc} |`);
  }

  lines.push("");
  lines.push(`_${suppliers.suppliers.length} suppliers — Last updated: ${today}_`);

  writeFileSync(join(process.cwd(), "suppliers.md"), lines.join("\n") + "\n");
  console.log(`\n📝 suppliers.md regenerated (${suppliers.suppliers.length} suppliers)`);
}

function regenerateWarehousesMd() {
  const lines: string[] = [
    "# Warehouses",
    "",
    "Master list of all warehouse locations with city and state.",
    "Auto-generated by sync — do not edit manually.",
    "",
    "| Warehouse | City | State | Storage Type |",
    "|-----------|------|-------|-------------|",
  ];

  for (const w of warehouses.warehouses) {
    lines.push(`| ${w.name} | ${w.city} | ${w.state} | ${w.storageType} |`);
  }

  lines.push("");
  lines.push(`_${warehouses.warehouses.length} warehouses — Last updated: ${today}_`);

  writeFileSync(join(process.cwd(), "warehouses.md"), lines.join("\n") + "\n");
  console.log(`📝 warehouses.md regenerated (${warehouses.warehouses.length} warehouses)`);
}

regenerateSuppliersMd();
regenerateWarehousesMd();

// ─── Step 5: Deduct discount lots from regular inventory ─────────

import { deductDiscountLots, validateDiscountItems, getDiscountItems } from "../lib/discount";

const deductionReport = deductDiscountLots();
if (deductionReport.lotsRemoved > 0 || deductionReport.missing > 0) {
  console.log(`\n🏷️  Discount lot deduction:`);
  if (deductionReport.lotsRemoved > 0) {
    console.log(`   ✅ ${deductionReport.lotsRemoved} lot(s) removed from regular inventory`);
    for (const d of deductionReport.details.filter((r) => r.action === "deducted")) {
      console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
    }
  }
  if (deductionReport.listingsEmptied > 0) {
    console.log(`   📦 ${deductionReport.listingsEmptied} listing(s) emptied and removed`);
  }
  if (deductionReport.productsRemoved > 0) {
    console.log(`   🗑️  ${deductionReport.productsRemoved} product(s) removed (all lots discounted)`);
  }
  if (deductionReport.missing > 0) {
    console.log(`   ⚠️  ${deductionReport.missing} discount lot(s) not found in ERP data:`);
    for (const d of deductionReport.details.filter((r) => r.action === "missing")) {
      console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
    }
  }
}

// ─── Step 6: Validate remaining discount items ──────────────────

const activeDiscountItems = getDiscountItems("active");
if (activeDiscountItems.length > 0) {
  console.log(`\n🏷️  Validating ${activeDiscountItems.length} active discount item(s) against new inventory...`);

  const currentProducts = inventory.products.map((p: any) => ({
    id: p.id,
    product: p.product,
    listings: (p.listings || []).map((l: any) => ({
      warehouse: l.warehouse,
      supplier: l.supplier,
    })),
  }));

  const report = validateDiscountItems(currentProducts);

  if (report.validated > 0) {
    console.log(`   ✅ ${report.validated} item(s) validated (stock still present)`);
  }
  if (report.missing > 0) {
    console.log(`   ⚠️  ${report.missing} item(s) marked as MISSING (stock no longer in inventory):`);
    for (const d of report.details.filter((r) => r.action === "missing")) {
      console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
    }
  }
  if (report.overlaps.length > 0) {
    console.log(`   ℹ️  ${report.overlaps.length} standalone item(s) may overlap with regular inventory:`);
    for (const d of report.details.filter((r) => r.action === "overlap")) {
      console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
    }
  }
} else {
  console.log("\n🏷️  No active discount items to validate.");
}

// ─── Step 7: Cleanup ─────────────────────────────────────────────

try {
  unlinkSync(proposedPath);
  console.log("\n🧹 Cleaned up data/inventory-proposed.json");
} catch {
  console.warn("⚠️  Could not delete data/inventory-proposed.json — clean up manually");
}

console.log("✅ Sync complete!");
