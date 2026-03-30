import Database from "better-sqlite3";
import { existsSync } from "fs";
import { getDbPath } from "./paths";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouses (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  storage_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  country_of_origin TEXT NOT NULL,
  trading_company   INTEGER NOT NULL DEFAULT 0,
  display_name      TEXT,
  note              TEXT
);

CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
  product_label TEXT NOT NULL,
  PRIMARY KEY (supplier_id, product_label)
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  product       TEXT NOT NULL,
  commodity     TEXT NOT NULL,
  category      TEXT NOT NULL,
  format        TEXT NOT NULL,
  process_type  TEXT NOT NULL,
  specification TEXT,
  variety       TEXT,
  grade         TEXT,
  organic       INTEGER NOT NULL DEFAULT 0,
  pack_size     TEXT NOT NULL,
  unit_type     TEXT NOT NULL,
  storage_type  TEXT
);

CREATE TABLE IF NOT EXISTS product_certifications (
  product_id    TEXT NOT NULL REFERENCES products(id),
  certification TEXT NOT NULL,
  PRIMARY KEY (product_id, certification)
);

CREATE TABLE IF NOT EXISTS listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        TEXT NOT NULL REFERENCES products(id),
  warehouse         TEXT NOT NULL,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  supplier          TEXT NOT NULL,
  country_of_origin TEXT NOT NULL,
  quantity          INTEGER NOT NULL,
  weight_lbs        REAL NOT NULL,
  arrived           TEXT NOT NULL,
  min_bbd           TEXT NOT NULL,
  unit_type         TEXT,
  pack_detail       TEXT
);

CREATE TABLE IF NOT EXISTS listing_contracts (
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  contract   TEXT NOT NULL,
  PRIMARY KEY (listing_id, contract)
);

CREATE TABLE IF NOT EXISTS lots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id),
  lot_number  TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  weight_lbs  REAL NOT NULL,
  bbd         TEXT NOT NULL,
  UNIQUE(listing_id, lot_number)
);

CREATE TABLE IF NOT EXISTS lot_contracts (
  lot_id   INTEGER NOT NULL REFERENCES lots(id),
  contract TEXT NOT NULL,
  PRIMARY KEY (lot_id, contract)
);

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  category      TEXT NOT NULL CHECK(category IN ('coa','test-results','specs','labels','photos')),
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL,
  base_contract TEXT,
  lot_numbers   TEXT
);

CREATE TABLE IF NOT EXISTS document_lots (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  lot_id      INTEGER NOT NULL REFERENCES lots(id),
  PRIMARY KEY (document_id, lot_id)
);

CREATE TABLE IF NOT EXISTS users (
  id       TEXT PRIMARY KEY,
  email    TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  password TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'qa'
);

CREATE TABLE IF NOT EXISTS product_flags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  flag       TEXT NOT NULL CHECK(flag IN ('new_arrival','featured')),
  set_at     TEXT NOT NULL,
  set_by     TEXT
);

CREATE TABLE IF NOT EXISTS discount_items (
  id                TEXT PRIMARY KEY,
  product_id        TEXT,
  product           TEXT NOT NULL,
  commodity         TEXT NOT NULL,
  category          TEXT NOT NULL,
  format            TEXT NOT NULL,
  organic           INTEGER NOT NULL DEFAULT 0,
  pack_size         TEXT NOT NULL,
  unit_type         TEXT NOT NULL,
  warehouse         TEXT NOT NULL,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  supplier          TEXT NOT NULL,
  country_of_origin TEXT NOT NULL,
  quantity          INTEGER NOT NULL,
  weight_lbs        REAL NOT NULL,
  lot_number        TEXT,
  contracts         TEXT,
  bbd               TEXT,
  reason            TEXT NOT NULL,
  notes             TEXT,
  asking_price      TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  added_date        TEXT NOT NULL,
  last_validated    TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content         TEXT NOT NULL,
  file_names      TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_email);

CREATE TABLE IF NOT EXISTS api_usage (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id       TEXT,
  user_email            TEXT NOT NULL,
  model                 TEXT NOT NULL,
  input_tokens          INTEGER NOT NULL,
  output_tokens         INTEGER NOT NULL,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  iterations            INTEGER NOT NULL DEFAULT 1,
  cost_usd              REAL NOT NULL,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_email);

CREATE TABLE IF NOT EXISTS document_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      TEXT NOT NULL,
  requester_name  TEXT NOT NULL,
  requester_company TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  message         TEXT,
  requested_docs  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','sent')),
  created_at      TEXT NOT NULL,
  reviewed_at     TEXT,
  reviewed_by     TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_requests_status ON document_requests(status);
CREATE INDEX IF NOT EXISTS idx_doc_requests_product ON document_requests(product_id);

CREATE TABLE IF NOT EXISTS coa_data (
  lot_id      INTEGER PRIMARY KEY REFERENCES lots(id),
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

function migrate(db: Database.Database): void {
  // Migrate documents table: add base_contract column and 'specs' category
  const docInfo = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  const hasBaseContract = docInfo.some((col) => col.name === "base_contract");
  if (docInfo.length > 0 && !hasBaseContract) {
    // Old schema exists without base_contract — recreate (safe since documents is empty)
    db.exec("DROP TABLE IF EXISTS documents");
  }

  // Migrate documents table: add lot_numbers column
  const hasLotNumbers = docInfo.some((col) => col.name === "lot_numbers");
  if (docInfo.length > 0 && hasBaseContract && !hasLotNumbers) {
    db.exec("ALTER TABLE documents ADD COLUMN lot_numbers TEXT");
  }

  // Migrate users table: add role column
  const userInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasRole = userInfo.some((col) => col.name === "role");
  if (userInfo.length > 0 && !hasRole) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'qa'");
  }
}

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath());
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON"); // Always enforce FK — safety net if prior crash left it OFF
    migrate(_db);
    _db.exec(SCHEMA_SQL);
    // Auto-seed if database is empty (first deploy / fresh install)
    // Skip during build — volume isn't mounted, so seeding would go to a throwaway DB
    const isBuild = process.env.NEXT_PHASE === "phase-production-build"
      || (process.env.RAILWAY_VOLUME_PATH && !existsSync(process.env.RAILWAY_VOLUME_PATH));
    if (!isBuild) {
      const count = _db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
      if (count.n === 0) {
        console.log("[db] Empty database detected — auto-seeding from JSON...");
        autoSeed(_db);
      }
      // Copy uploads from build image to volume (first deploy only)
      copyUploadsToVolume();
    }
  }
  return _db;
}

/** Seed database from JSON data files. Called automatically on first access if DB is empty. */
function autoSeed(db: Database.Database): void {
  const { readFileSync, existsSync } = require("fs");
  const { join } = require("path");

  const dataDir = join(process.cwd(), "data");
  const inventoryPath = join(dataDir, "inventory.json");
  if (!existsSync(inventoryPath)) {
    console.log("[db] No data/inventory.json found — skipping auto-seed.");
    return;
  }

  function readJson(filename: string) {
    return JSON.parse(readFileSync(join(dataDir, filename), "utf-8"));
  }

  const inventory = readJson("inventory.json");
  const suppliers = readJson("suppliers.json");
  const warehouses = readJson("warehouses.json");
  const users = readJson("users.json");
  const documents = readJson("documents.json");

  const seed = db.transaction(() => {
    // Metadata
    db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run("lastUpdated", inventory.lastUpdated);

    // Warehouses
    const insertWarehouse = db.prepare("INSERT INTO warehouses (id, name, city, state, storage_type) VALUES (?, ?, ?, ?, ?)");
    for (const w of warehouses.warehouses) {
      insertWarehouse.run(w.id, w.name, w.city, w.state, w.storageType);
    }

    // Suppliers
    const insertSupplier = db.prepare("INSERT INTO suppliers (id, name, country_of_origin, trading_company, display_name, note) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSupplierProduct = db.prepare("INSERT INTO supplier_products (supplier_id, product_label) VALUES (?, ?)");
    for (const s of suppliers.suppliers) {
      insertSupplier.run(s.id, s.name, s.countryOfOrigin, s.tradingCompany ? 1 : 0, s.displayName ?? null, s.note ?? null);
      for (const p of s.products) {
        insertSupplierProduct.run(s.id, p);
      }
    }

    // Products + listings + lots + contracts
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
      for (const cert of p.certifications || []) {
        insertCert.run(p.id, cert);
      }
      for (const l of p.listings) {
        const result = insertListing.run(p.id, l.warehouse, l.city, l.state, l.supplier, l.countryOfOrigin, l.quantity, l.weightLbs, l.arrived, l.minBBD, l.unitType ?? null, l.packDetail ?? null);
        const listingId = Number(result.lastInsertRowid);
        for (const c of l.contracts) { insertContract.run(listingId, c); }
        for (const lot of l.lots || []) {
          const existing = findLot.get(listingId, lot.lotNumber) as { id: number } | undefined;
          let lotId: number;
          if (existing) {
            lotId = existing.id;
            updateLot.run(lot.quantity, lot.weightLbs, lotId);
          } else {
            const lotResult = insertLot.run(listingId, lot.lotNumber, lot.quantity, lot.weightLbs, lot.bbd ?? null);
            lotId = Number(lotResult.lastInsertRowid);
          }
          for (const c of lot.contracts || []) { insertLotContract.run(lotId, c); }
        }
      }
    }

    // Documents
    const insertDoc = db.prepare("INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by, base_contract, lot_numbers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const d of documents.documents) {
      const lotNumbers = Array.isArray(d.lotNumbers) ? JSON.stringify(d.lotNumbers) : (d.lotNumbers ?? null);
      insertDoc.run(d.id, d.productId, d.category, d.filename, d.originalName, d.uploadedAt, d.uploadedBy, d.baseContract ?? null, lotNumbers);
    }

    // Users
    const insertUser = db.prepare("INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, ?)");
    for (const u of users.users) {
      insertUser.run(u.id, u.email, u.name, u.password, u.role || "qa");
    }

    console.log(`[db] Auto-seeded: ${inventory.products.length} products, ${warehouses.warehouses.length} warehouses, ${suppliers.suppliers.length} suppliers, ${users.users.length} users`);
  });

  seed();

  // Re-link document-lot associations and load discount items
  try {
    const { relinkDocumentLots } = require("./documents");
    relinkDocumentLots();
    const { loadDiscountFromJson, deductDiscountLots } = require("./discount");
    const discountCount = loadDiscountFromJson();
    if (discountCount > 0) deductDiscountLots();
  } catch (e) {
    console.log("[db] Post-seed linking skipped:", (e as Error).message);
  }

}

/** Copy uploaded documents from build image to persistent volume (runs once). */
function copyUploadsToVolume(): void {
  const vol = process.env.RAILWAY_VOLUME_PATH;
  if (!vol) return;
  const { existsSync: exists, cpSync } = require("fs");
  const { join: pjoin } = require("path");
  if (!exists(vol)) return;
  const srcUploads = pjoin(process.cwd(), "public", "uploads");
  const destUploads = pjoin(vol, "uploads");
  if (exists(srcUploads) && !exists(destUploads)) {
    try {
      cpSync(srcUploads, destUploads, { recursive: true });
      console.log("[db] Copied uploads from build image to volume.");
    } catch (e) {
      console.log("[db] Upload copy failed:", (e as Error).message);
    }
  }
}
