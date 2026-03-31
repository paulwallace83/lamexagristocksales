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
  acidity_malic_acid: { label: "Acidity Malic Acid", unit: "%", order: 2 },
  acidity_citric_acid: { label: "Acidity Citric Acid", unit: "%", order: 2 },
  lactic_acid: { label: "Lactic Acid", unit: "%", order: 2 },
  ph: { label: "pH", order: 3 },
  ratio: { label: "Ratio", order: 4 },
  color: { label: "Color", order: 5 },
  clarity: { label: "Clarity", order: 6 },
  ntu: { label: "NTU", unit: "NTU", order: 7 },
  defects: { label: "Defects", unit: "%", order: 8 },
  crushed: { label: "Crushed", unit: "%", order: 8 },
  crushed_broken: { label: "Crushed Broken", unit: "%", order: 8 },
  overripe: { label: "Overripe", unit: "%", order: 9 },
  underripe: { label: "Underripe", unit: "%", order: 9 },
  unripe: { label: "Unripe", unit: "%", order: 9 },
  stem: { label: "Stem", unit: "%", order: 10 },
  stem_defects: { label: "Stem Defects", unit: "%", order: 10 },
  cap_stems_defects: { label: "Cap/Stems", unit: "%", order: 10 },
  out_size_defects: { label: "Out of Size", unit: "%", order: 10 },
  color_variation_defects: { label: "Color Variation", unit: "%", order: 10 },
  damaged_blemished_defects: { label: "Damaged/Blemished", unit: "%", order: 10 },
  serious_cracks_defects: { label: "Serious Cracks", unit: "%", order: 10 },
  undeveloped_or_damaged: { label: "Undeveloped/Damaged", unit: "%", order: 10 },
  underdeveloped_damaged: { label: "Underdeveloped/Damaged", unit: "%", order: 10 },
};

export interface FormattedCoaField {
  label: string;
  value: string;
}

/** Maximum number of COA pills to display per lot on the product detail page. */
const MAX_DISPLAY_FIELDS = 6;

const HEAVY_METAL_PATTERNS = ["lead", "pb_", "_pb", "arsenic", "as_", "_as", "cadmium", "cd_", "_cd", "mercury", "hg_", "_hg", "tin_sn"];
const PESTICIDE_PATTERNS = ["pesticide", "residue", "chlorpyrifos", "glyphosate", "ddt", "organophosphate", "fungicide", "herbicide", "insecticide"];

/** Fields that match heavy metal patterns but are NOT heavy metal test results. */
const HEAVY_METAL_FALSE_POSITIVES = new Set(["metal_detection"]);

/** Detect whether COA fields contain heavy metal or pesticide test data. */
export function detectCoaTestTypes(fields: CoaFields): { hasHeavyMetals: boolean; hasPesticide: boolean } {
  let hasHeavyMetals = false;
  let hasPesticide = false;
  for (const key of Object.keys(fields)) {
    const normalized = key.toLowerCase().replace(/[\s.\-]/g, "_");
    if (!hasHeavyMetals && !HEAVY_METAL_FALSE_POSITIVES.has(normalized) && HEAVY_METAL_PATTERNS.some((p) => normalized.includes(p))) hasHeavyMetals = true;
    if (!hasPesticide && PESTICIDE_PATTERNS.some((p) => normalized.includes(p))) hasPesticide = true;
    if (hasHeavyMetals && hasPesticide) break;
  }
  return { hasHeavyMetals, hasPesticide };
}

/** Fields excluded from public display — microorganism analysis, logistics, packaging. */
const EXCLUDED_PATTERNS = [
  // Microorganism / microbiology
  "aerobic", "coliform", "e_coli", "ecoli", "escherichia", "yeast", "mold", "mould",
  "salmonella", "listeria", "staphylococcus", "total_count", "tpc",
  "total_plate_count", "heat_resistant", "tab_lod", "acb_lod", "alicyclobacillus",
  // Heavy metals (with and without underscore prefix for symbol abbreviations)
  "lead", "pb_", "_pb", "arsenic", "as_", "_as", "cadmium", "cd_", "_cd",
  "mercury", "hg_", "_hg", "tin_sn",
  // Mycotoxins
  "patulin", "paluin", "aflatoxin", "ochratoxin",
  // Weight / packaging / logistics
  "net_weight", "gross_weight", "number_of_drums", "number_of_cartons",
  "number_of_cases", "unit_packaging", "quantity_kg",
  // Temperature / storage / shipping
  "storage_temperature", "shipping_temperature", "temperature",
  // Administrative
  "fda_no", "quality_control", "batch_no", "batch_code", "product_date",
  "production_date", "expiry_date", "shelf_life", "metal_detection",
];

function isExcludedField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s.\-]/g, "_");
  return EXCLUDED_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Format COA fields for display. Returns entries in a stable order:
 * known fields first (by defined order), then unknown fields alphabetically.
 * Excludes microorganism data, weight/packaging, and temperature fields.
 * Capped at MAX_DISPLAY_FIELDS entries.
 */
export function formatCoaFields(fields: CoaFields): FormattedCoaField[] {
  const entries: Array<FormattedCoaField & { order: number }> = [];

  // Merge EVM sub-fields into a single "EVM" pill (show the minimum value)
  const evmValues: number[] = [];
  if (typeof fields.evm_leaves_caps_bracts === "number") evmValues.push(fields.evm_leaves_caps_bracts);
  if (typeof fields.evm_weeds_grass === "number") evmValues.push(fields.evm_weeds_grass);
  if (evmValues.length > 0) {
    entries.push({ label: "EVM", value: String(Math.min(...evmValues)), order: 11 });
  }

  const EVM_KEYS = new Set(["evm_leaves_caps_bracts", "evm_weeds_grass"]);

  for (const [key, value] of Object.entries(fields)) {
    if (EVM_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === "" || typeof value === "object") continue;
    if (isExcludedField(key)) continue;
    const displayValue = typeof value === "number"
      ? String(value)
      : String(value).slice(0, 50);
    const known = KNOWN_FIELDS[key];
    if (known) {
      const display =
        known.unit && typeof value === "number"
          ? `${value} ${known.unit}`
          : displayValue;
      entries.push({ label: known.label, value: display, order: known.order });
    } else {
      // Unknown field: strip non-alphanumeric, then title-case
      const label = key
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (!label) continue;
      entries.push({ label, value: displayValue, order: 100 });
    }
  }

  entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return entries.slice(0, MAX_DISPLAY_FIELDS).map(({ label, value }) => ({ label, value }));
}
