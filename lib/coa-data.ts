/**
 * lib/coa-data.ts — Data access layer for COA key aspects stored per lot.
 *
 * COA data is stored as a flexible JSON object (any key-value pairs).
 * Values are single figures (number or short string), never ranges.
 */

import { getDb } from "./db";

// Flexible key-value pairs — any COA parameter can be stored
export type CoaFields = Record<string, number | string>;

export interface CoaData {
  fields: CoaFields;
  updatedAt: string;
  updatedBy: string;
}

// ── Query ──────────────────────────────────────────────────────────────

/**
 * Batch-fetch COA data for multiple lots (used by product detail page).
 */
export function getCoaDataForLots(lotIds: number[]): Map<number, CoaData> {
  if (lotIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = lotIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT lot_id, data, updated_at, updated_by FROM coa_data WHERE lot_id IN (${placeholders})`)
    .all(...lotIds) as Array<{ lot_id: number; data: string; updated_at: string; updated_by: string }>;

  const map = new Map<number, CoaData>();
  for (const row of rows) {
    try {
      const fields = JSON.parse(row.data) as CoaFields;
      if (typeof fields === "object" && fields !== null && Object.keys(fields).length > 0) {
        map.set(row.lot_id, { fields, updatedAt: row.updated_at, updatedBy: row.updated_by });
      }
    } catch {
      // Skip malformed JSON
    }
  }
  return map;
}

// ── Upsert ─────────────────────────────────────────────────────────────

/**
 * Insert or replace COA data for a lot.
 */
export function upsertCoaData(lotId: number, fields: CoaFields, updatedBy: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const data = JSON.stringify(fields);
  db.prepare(
    `INSERT INTO coa_data (lot_id, data, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(lot_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(lotId, data, now, updatedBy);
}

// ── Sync preservation ──────────────────────────────────────────────────

export interface ExportedCoaRow {
  lotNumber: string;
  productId: string;
  data: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Export all COA data with lot numbers (not IDs) for sync preservation.
 * Call BEFORE deleting lots in the sync transaction.
 */
export function exportCoaData(): ExportedCoaRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.lot_number AS lotNumber, li.product_id AS productId,
              cd.data, cd.updated_at AS updatedAt, cd.updated_by AS updatedBy
       FROM coa_data cd
       JOIN lots l ON cd.lot_id = l.id
       JOIN listings li ON l.listing_id = li.id`,
    )
    .all() as ExportedCoaRow[];
}

/**
 * Re-insert exported COA data after re-seed by matching lot numbers.
 * Call AFTER lots have been re-seeded.
 */
export function relinkCoaData(saved: ExportedCoaRow[]): { linked: number; orphaned: number } {
  if (saved.length === 0) return { linked: 0, orphaned: 0 };
  const db = getDb();
  let linked = 0;
  let orphaned = 0;

  const findLot = db.prepare(
    `SELECT lo.id FROM lots lo
     JOIN listings li ON lo.listing_id = li.id
     WHERE li.product_id = ? AND lo.lot_number = ?`,
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO coa_data (lot_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const row of saved) {
      const lot = findLot.get(row.productId, row.lotNumber) as { id: number } | undefined;
      if (lot) {
        insert.run(lot.id, row.data, row.updatedAt, row.updatedBy);
        linked++;
      } else {
        orphaned++;
      }
    }
  });
  tx();

  return { linked, orphaned };
}

// ── Display formatting ─────────────────────────────────────────────────

const KNOWN_FIELDS: Record<string, { label: string; unit?: string; order: number }> = {
  brix: { label: "Brix", unit: "Bx", order: 1 },
  acidity: { label: "Acidity", unit: "%", order: 2 },
  ratio: { label: "Ratio", order: 3 },
  color: { label: "Color", order: 4 },
  clarity: { label: "Clarity", order: 5 },
  ntu: { label: "NTU", unit: "NTU", order: 6 },
  defects: { label: "Defects", unit: "%", order: 7 },
  overripe: { label: "Overripe", unit: "%", order: 8 },
  underripe: { label: "Underripe", unit: "%", order: 9 },
};

export interface FormattedCoaField {
  label: string;
  value: string;
}

/**
 * Format COA fields for display. Returns entries in a stable order:
 * known fields first (by defined order), then unknown fields alphabetically.
 */
export function formatCoaFields(fields: CoaFields): FormattedCoaField[] {
  const entries: Array<FormattedCoaField & { order: number }> = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "" || typeof value === "object") continue;
    const known = KNOWN_FIELDS[key];
    if (known) {
      const display =
        known.unit && typeof value === "number"
          ? `${value} ${known.unit}`
          : String(value);
      entries.push({ label: known.label, value: display, order: known.order });
    } else {
      // Unknown field: strip non-alphanumeric, then title-case
      const label = key
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (!label) continue;
      entries.push({ label, value: String(value), order: 100 });
    }
  }

  entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return entries.map(({ label, value }) => ({ label, value }));
}
