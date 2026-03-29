import { NextResponse } from "next/server";
import { existsSync, readdirSync, cpSync, unlinkSync } from "fs";
import { join } from "path";
import { getDataDir, getDbPath, getUploadsRoot } from "@/lib/paths";
import { getDb } from "@/lib/db";

export async function GET() {
  const vol = process.env.RAILWAY_VOLUME_PATH;
  const cwd = process.cwd();
  const uploadsRoot = getUploadsRoot();
  const publicUploadsExist = existsSync(join(cwd, "public", "uploads"));
  const uploadsExist = existsSync(uploadsRoot);

  // Copy uploads if needed
  let copyResult = "not needed";
  if (vol && existsSync(vol) && publicUploadsExist && !uploadsExist) {
    try {
      cpSync(join(cwd, "public", "uploads"), join(vol, "uploads"), { recursive: true });
      copyResult = "success";
    } catch (e) {
      copyResult = `failed: ${(e as Error).message}`;
    }
  }

  // Check DB product count and force seed if empty
  let seedResult = "not needed";
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  if (count.n === 0) {
    // Delete the empty DB and let getDb() re-create and auto-seed
    // We can't easily re-trigger getDb's init, so seed inline
    seedResult = "attempting...";
    try {
      const dataDir = join(cwd, "data");
      const { readFileSync } = require("fs");
      function readJson(filename: string) {
        return JSON.parse(readFileSync(join(dataDir, filename), "utf-8"));
      }
      const inventory = readJson("inventory.json");
      const suppliers = readJson("suppliers.json");
      const warehouses = readJson("warehouses.json");
      const users = readJson("users.json");
      const documents = readJson("documents.json");

      const seed = db.transaction(() => {
        db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run("lastUpdated", inventory.lastUpdated);
        const insertWarehouse = db.prepare("INSERT INTO warehouses (id, name, city, state, storage_type) VALUES (?, ?, ?, ?, ?)");
        for (const w of warehouses.warehouses) insertWarehouse.run(w.id, w.name, w.city, w.state, w.storageType);
        const insertSupplier = db.prepare("INSERT INTO suppliers (id, name, country_of_origin, trading_company, display_name, note) VALUES (?, ?, ?, ?, ?, ?)");
        const insertSupplierProduct = db.prepare("INSERT INTO supplier_products (supplier_id, product_label) VALUES (?, ?)");
        for (const s of suppliers.suppliers) {
          insertSupplier.run(s.id, s.name, s.countryOfOrigin, s.tradingCompany ? 1 : 0, s.displayName ?? null, s.note ?? null);
          for (const p of s.products) insertSupplierProduct.run(s.id, p);
        }
        const insertProduct = db.prepare("INSERT INTO products (id, product, commodity, category, format, process_type, specification, variety, grade, organic, pack_size, unit_type, storage_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const insertCert = db.prepare("INSERT INTO product_certifications (product_id, certification) VALUES (?, ?)");
        const insertListing = db.prepare("INSERT INTO listings (product_id, warehouse, city, state, supplier, country_of_origin, quantity, weight_lbs, arrived, min_bbd, unit_type, pack_detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const insertContract = db.prepare("INSERT INTO listing_contracts (listing_id, contract) VALUES (?, ?)");
        const insertLot = db.prepare("INSERT INTO lots (listing_id, lot_number, quantity, weight_lbs, bbd) VALUES (?, ?, ?, ?, ?)");
        const updateLot = db.prepare("UPDATE lots SET quantity = quantity + ?, weight_lbs = weight_lbs + ? WHERE id = ?");
        const insertLotContract = db.prepare("INSERT OR IGNORE INTO lot_contracts (lot_id, contract) VALUES (?, ?)");
        const findLot = db.prepare("SELECT id FROM lots WHERE listing_id = ? AND lot_number = ?");
        for (const p of inventory.products) {
          insertProduct.run(p.id, p.product, p.commodity, p.category, p.format, p.processType, p.specification ?? null, p.variety ?? null, p.grade ?? null, p.organic ? 1 : 0, p.packSize, p.unitType, p.storageType ?? null);
          for (const cert of p.certifications || []) insertCert.run(p.id, cert);
          for (const l of p.listings) {
            const result = insertListing.run(p.id, l.warehouse, l.city, l.state, l.supplier, l.countryOfOrigin, l.quantity, l.weightLbs, l.arrived, l.minBBD, l.unitType ?? null, l.packDetail ?? null);
            const listingId = Number(result.lastInsertRowid);
            for (const c of l.contracts) insertContract.run(listingId, c);
            for (const lot of l.lots || []) {
              const existing = findLot.get(listingId, lot.lotNumber) as { id: number } | undefined;
              let lotId: number;
              if (existing) { lotId = existing.id; updateLot.run(lot.quantity, lot.weightLbs, lotId); }
              else { const r = insertLot.run(listingId, lot.lotNumber, lot.quantity, lot.weightLbs, lot.bbd ?? null); lotId = Number(r.lastInsertRowid); }
              for (const c of lot.contracts || []) insertLotContract.run(lotId, c);
            }
          }
        }
        const insertDoc = db.prepare("INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by, base_contract, lot_numbers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        for (const d of documents.documents) {
          const lotNumbers = Array.isArray(d.lotNumbers) ? JSON.stringify(d.lotNumbers) : (d.lotNumbers ?? null);
          insertDoc.run(d.id, d.productId, d.category, d.filename, d.originalName, d.uploadedAt, d.uploadedBy, d.baseContract ?? null, lotNumbers);
        }
        const insertUser = db.prepare("INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, ?)");
        for (const u of users.users) insertUser.run(u.id, u.email, u.name, u.password, u.role || "qa");
      });
      seed();

      // Re-link and discount
      try {
        const { relinkDocumentLots } = require("@/lib/documents");
        relinkDocumentLots();
        const { loadDiscountFromJson, deductDiscountLots } = require("@/lib/discount");
        const dc = loadDiscountFromJson();
        if (dc > 0) deductDiscountLots();
      } catch { /* ignore */ }

      const newCount = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
      seedResult = `success — ${newCount.n} products`;
    } catch (e) {
      seedResult = `failed: ${(e as Error).message}`;
    }
  } else {
    seedResult = `not needed — ${count.n} products already in DB`;
  }

  return NextResponse.json({
    dbPath: getDbPath(),
    productCount: count.n,
    seedResult,
    copyResult,
    uploadsExist: existsSync(uploadsRoot),
    volContents: vol && existsSync(vol) ? readdirSync(vol) : [],
  });
}
