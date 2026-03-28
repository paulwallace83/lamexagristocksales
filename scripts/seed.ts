/**
 * scripts/seed.ts — Full destructive seed for fresh installs.
 * Clears ALL tables (including documents and users) and reloads from JSON.
 *
 * For weekly inventory syncs, use `npm run sync` (scripts/sync-inventory.ts)
 * which preserves documents and users.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "../lib/db";

const dataDir = join(process.cwd(), "data");

function readJson(filename: string) {
  return JSON.parse(readFileSync(join(dataDir, filename), "utf-8"));
}

const db = getDb();

// Clear all tables (order matters for FK references — children before parents)
db.exec(`
  DELETE FROM document_lots;
  DELETE FROM documents;
  DELETE FROM lot_contracts;
  DELETE FROM lots;
  DELETE FROM listing_contracts;
  DELETE FROM listings;
  DELETE FROM product_certifications;
  DELETE FROM supplier_products;
  DELETE FROM products;
  DELETE FROM suppliers;
  DELETE FROM warehouses;
  DELETE FROM users;
  DELETE FROM metadata;
`);

const inventory = readJson("inventory.json");
const suppliers = readJson("suppliers.json");
const warehouses = readJson("warehouses.json");
const users = readJson("users.json");
const documents = readJson("documents.json");

const seed = db.transaction(() => {
  // Metadata
  const insertMeta = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
  insertMeta.run("lastUpdated", inventory.lastUpdated);

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
    insertSupplier.run(s.id, s.name, s.countryOfOrigin, s.tradingCompany ? 1 : 0, s.displayName ?? null, s.note ?? null);
    for (const p of s.products) {
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
  const updateLot = db.prepare(
    "UPDATE lots SET quantity = quantity + ?, weight_lbs = weight_lbs + ? WHERE id = ?"
  );
  const insertLotContract = db.prepare(
    "INSERT OR IGNORE INTO lot_contracts (lot_id, contract) VALUES (?, ?)"
  );
  const findLot = db.prepare(
    "SELECT id FROM lots WHERE listing_id = ? AND lot_number = ?"
  );

  let totalListings = 0;
  let totalContracts = 0;
  let totalLots = 0;

  for (const p of inventory.products) {
    insertProduct.run(
      p.id, p.product, p.commodity, p.category, p.format, p.processType,
      p.specification ?? null, p.variety ?? null, p.grade ?? null,
      p.organic ? 1 : 0, p.packSize, p.unitType, p.storageType ?? null
    );

    for (const cert of p.certifications || []) {
      insertCert.run(p.id, cert);
    }

    for (const l of p.listings) {
      const result = insertListing.run(
        p.id, l.warehouse, l.city, l.state, l.supplier, l.countryOfOrigin,
        l.quantity, l.weightLbs, l.arrived, l.minBBD,
        l.unitType ?? null, l.packDetail ?? null
      );
      const listingId = Number(result.lastInsertRowid);
      totalListings++;

      for (const c of l.contracts) {
        insertContract.run(listingId, c);
        totalContracts++;
      }

      for (const lot of l.lots || []) {
        const existing = findLot.get(listingId, lot.lotNumber) as { id: number } | undefined;
        let lotId: number;
        if (existing) {
          // Aggregate quantity and weight into existing lot row
          lotId = existing.id;
          updateLot.run(lot.quantity, lot.weightLbs, lotId);
        } else {
          const lotResult = insertLot.run(
            listingId, lot.lotNumber, lot.quantity, lot.weightLbs, lot.bbd ?? null
          );
          lotId = Number(lotResult.lastInsertRowid);
          totalLots++;
        }
        for (const c of lot.contracts || []) {
          insertLotContract.run(lotId, c);
        }
      }
    }
  }

  // Documents
  const insertDoc = db.prepare(`
    INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by, base_contract)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const d of documents.documents) {
    insertDoc.run(d.id, d.productId, d.category, d.filename, d.originalName, d.uploadedAt, d.uploadedBy, d.baseContract ?? null);
  }

  // Users — passwords in users.json MUST be pre-hashed with bcrypt
  const insertUser = db.prepare(
    "INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, ?)"
  );
  for (const u of users.users) {
    insertUser.run(u.id, u.email, u.name, u.password, u.role || "qa");
  }

  console.log(`Seeded:`);
  console.log(`  ${inventory.products.length} products`);
  console.log(`  ${totalListings} listings`);
  console.log(`  ${totalLots} lots`);
  console.log(`  ${totalContracts} contracts`);
  console.log(`  ${warehouses.warehouses.length} warehouses`);
  console.log(`  ${suppliers.suppliers.length} suppliers`);
  console.log(`  ${documents.documents.length} documents`);
  console.log(`  ${users.users.length} users`);
});

seed();
console.log("Done.");
