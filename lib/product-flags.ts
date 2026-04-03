/**
 * lib/product-flags.ts — CRUD for the product_flags table.
 *
 * Tracks "new_arrival" (auto-set by sync) and "featured" (manual admin toggle)
 * flags per product. Preserved across weekly syncs.
 */

import { getDb } from "./db";

export type FlagType = "new_arrival" | "featured";

export interface ProductFlag {
  id: number;
  productId: string;
  flag: FlagType;
  setAt: string;
  setBy: string | null;
}

/** Get all flags, optionally filtered by type. */
export function getFlags(flag?: FlagType): ProductFlag[] {
  const db = getDb();
  const sql = flag
    ? "SELECT id, product_id, flag, set_at, set_by FROM product_flags WHERE flag = ?"
    : "SELECT id, product_id, flag, set_at, set_by FROM product_flags";
  const rows = (flag ? db.prepare(sql).all(flag) : db.prepare(sql).all()) as Array<{
    id: number;
    product_id: string;
    flag: string;
    set_at: string;
    set_by: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    flag: r.flag as FlagType,
    setAt: r.set_at,
    setBy: r.set_by,
  }));
}

/** Get flags for a specific product. */
export function getFlagsForProduct(productId: string): ProductFlag[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, product_id, flag, set_at, set_by FROM product_flags WHERE product_id = ?")
    .all(productId) as Array<{
    id: number;
    product_id: string;
    flag: string;
    set_at: string;
    set_by: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    flag: r.flag as FlagType,
    setAt: r.set_at,
    setBy: r.set_by,
  }));
}

/** Set a flag on a product. No-op if the flag already exists. */
export function setFlag(productId: string, flag: FlagType, setBy: string): void {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM product_flags WHERE product_id = ? AND flag = ?")
    .get(productId, flag);
  if (existing) return;
  db.prepare("INSERT INTO product_flags (product_id, flag, set_at, set_by) VALUES (?, ?, ?, ?)").run(
    productId,
    flag,
    new Date().toISOString().slice(0, 10),
    setBy,
  );
}

/** Remove a specific flag from a product. */
export function removeFlag(productId: string, flag: FlagType): void {
  const db = getDb();
  db.prepare("DELETE FROM product_flags WHERE product_id = ? AND flag = ?").run(productId, flag);
}

/** Toggle a flag on a product. Returns true if the flag is now set. Atomic via transaction. */
export function toggleFlag(productId: string, flag: FlagType, setBy: string): boolean {
  const db = getDb();
  let nowSet = false;
  const txn = db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM product_flags WHERE product_id = ? AND flag = ?")
      .get(productId, flag);
    if (existing) {
      db.prepare("DELETE FROM product_flags WHERE product_id = ? AND flag = ?").run(productId, flag);
      nowSet = false;
    } else {
      db.prepare("INSERT INTO product_flags (product_id, flag, set_at, set_by) VALUES (?, ?, ?, ?)").run(
        productId,
        flag,
        new Date().toISOString().slice(0, 10),
        setBy,
      );
      nowSet = true;
    }
  });
  txn();
  return nowSet;
}

/** Clear all flags of a given type. Used by sync to reset new_arrival flags. */
export function clearFlags(flag: FlagType): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM product_flags WHERE flag = ?").run(flag);
  return result.changes;
}

/** Bulk-set new_arrival flags for multiple product IDs. Clears existing new_arrival flags first. */
export function setNewArrivals(productIds: string[]): number {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM product_flags WHERE flag = 'new_arrival'").run();
    const insert = db.prepare(
      "INSERT INTO product_flags (product_id, flag, set_at, set_by) VALUES (?, 'new_arrival', ?, 'sync')",
    );
    for (const id of productIds) {
      insert.run(id, today);
    }
  });
  txn();
  return productIds.length;
}

/** Get new-arrival flags with product names (inner join excludes orphans). */
export function getNewArrivalsWithNames(): Array<{
  productId: string;
  productName: string;
  flaggedAt: string;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pf.product_id, p.product, pf.set_at
       FROM product_flags pf
       JOIN products p ON p.id = pf.product_id
       WHERE pf.flag = ?
       ORDER BY pf.set_at DESC`,
    )
    .all("new_arrival") as Array<{ product_id: string; product: string; set_at: string }>;
  return rows.map((r) => ({
    productId: r.product_id,
    productName: r.product,
    flaggedAt: r.set_at,
  }));
}

/** Get a Set of product IDs that have a given flag. */
export function getFlaggedProductIds(flag: FlagType): Set<string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT product_id FROM product_flags WHERE flag = ?")
    .all(flag) as Array<{ product_id: string }>;
  return new Set(rows.map((r) => r.product_id));
}
