import Database from "better-sqlite3";
import { join } from "path";

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
    _db = new Database(join(process.cwd(), "lamex.db"));
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON"); // Always enforce FK — safety net if prior crash left it OFF
    migrate(_db);
    _db.exec(SCHEMA_SQL);
  }
  return _db;
}
