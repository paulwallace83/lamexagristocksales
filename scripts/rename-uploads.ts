#!/usr/bin/env tsx
/**
 * scripts/rename-uploads.ts
 *
 * Renames old-format uploaded files (unix-timestamp prefix) to the new
 * descriptive naming convention:
 *   Lot-level:      YYYY-MM-DD. {Product} - {Type} - {LotNumber}.ext
 *   Contract-level: YYYY-MM-DD. {Product} - {Contract} | {COO} | {Type}.ext
 *
 * Safe to run multiple times — skips files that already match the new format.
 * Works both locally and on Railway (uses lib/paths.ts for root resolution).
 *
 * Usage:
 *   npm run rename-uploads
 *   railway run npm run rename-uploads
 */

import Database from "better-sqlite3";
import { existsSync, readdirSync, renameSync } from "fs";
import { join, dirname } from "path";
import { getDbPath, getUploadsRoot } from "../lib/paths.js";
import { generateDocFilename } from "../lib/documents.js";
import type { DocCategory } from "../lib/documents.js";

// Old format: starts with 13-digit unix ms timestamp
const OLD_FILENAME_RE = /^\d{13,}-/;

interface DocRecord {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  filename: string;
  base_contract: string | null;
  lot_numbers: string | null;
  country_of_origin: string | null;
  uploaded_at: string;
}

/**
 * Scan the product directory tree to find where a given filename actually
 * lives on disk. Returns the full absolute path or null if not found.
 */
function findFileOnDisk(
  uploadsRoot: string,
  productId: string,
  category: string,
  filename: string,
): string | null {
  const productDir = join(uploadsRoot, productId);
  if (!existsSync(productDir)) return null;

  for (const subtype of ["lots", "contracts"]) {
    const subtypeDir = join(productDir, subtype);
    if (!existsSync(subtypeDir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(subtypeDir);
    } catch {
      continue;
    }
    for (const sub of entries) {
      const catDir = join(subtypeDir, sub, category);
      const filepath = join(catDir, filename);
      if (existsSync(filepath)) return filepath;
    }
  }
  return null;
}

/**
 * Extract the lot-number or contract identifier from a file's full path.
 * E.g. ".../lots/25AJCA207B/coa/file.pdf" → "25AJCA207B"
 *      ".../contracts/124717/specs/file.pdf" → "124717"
 */
function identifierFromPath(filepath: string): string | null {
  // Normalise separators
  const parts = filepath.replace(/\\/g, "/").split("/");
  // Find "lots" or "contracts" segment, identifier is the segment after it
  const lotsIdx = parts.lastIndexOf("lots");
  if (lotsIdx >= 0 && parts[lotsIdx + 1]) return parts[lotsIdx + 1];
  const contractsIdx = parts.lastIndexOf("contracts");
  if (contractsIdx >= 0 && parts[contractsIdx + 1]) return parts[contractsIdx + 1];
  return null;
}

async function main() {
  const dbPath = getDbPath();
  const uploadsRoot = getUploadsRoot();

  console.log(`\n📁 Uploads root : ${uploadsRoot}`);
  console.log(`🗄  Database     : ${dbPath}\n`);

  if (!existsSync(dbPath)) {
    console.error("Database not found. Run npm run seed or npm run sync first.");
    process.exit(1);
  }
  if (!existsSync(uploadsRoot)) {
    console.error("Uploads directory not found:", uploadsRoot);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Fetch all documents with product name and COO.
  // COO falls back to discount_items when no active listing exists (e.g. lot moved to discount).
  const docs = db.prepare(`
    SELECT
      d.id,
      d.product_id,
      p.product        AS product_name,
      d.category,
      d.filename,
      d.base_contract,
      d.lot_numbers,
      COALESCE(li.country_of_origin, di.country_of_origin) AS country_of_origin,
      d.uploaded_at
    FROM documents d
    JOIN products p ON d.product_id = p.id
    LEFT JOIN (
      SELECT product_id, country_of_origin
      FROM listings
      GROUP BY product_id
    ) li ON li.product_id = d.product_id
    LEFT JOIN (
      SELECT product_id, country_of_origin
      FROM discount_items
      WHERE status = 'active' AND product_id IS NOT NULL
      GROUP BY product_id
    ) di ON di.product_id = d.product_id
  `).all() as DocRecord[];

  const needRename = docs.filter((d) => OLD_FILENAME_RE.test(d.filename));
  console.log(`Total documents : ${docs.length}`);
  console.log(`Already renamed : ${docs.length - needRename.length}`);
  console.log(`To rename       : ${needRename.length}\n`);

  if (needRename.length === 0) {
    console.log("✅ Nothing to do — all files already use descriptive names.");
    db.close();
    return;
  }

  const updateFilename = db.prepare(
    "UPDATE documents SET filename = ? WHERE id = ?",
  );

  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of needRename) {
    const cat = doc.category as DocCategory;

    // Locate the file on disk
    const currentPath = findFileOnDisk(uploadsRoot, doc.product_id, cat, doc.filename);
    if (!currentPath) {
      console.warn(`  ⚠  NOT FOUND  ${doc.product_id}/${cat}/${doc.filename}`);
      skipped++;
      continue;
    }

    const fileDir = dirname(currentPath);

    // Extract the storage identifier (lot number or contract) from the actual path
    const storageId = identifierFromPath(currentPath);

    // Date: use the uploaded_at date as a reasonable approximation
    const documentDate = doc.uploaded_at.slice(0, 10);

    // For lot-level, lotNumber = storage dir name
    // For contract-level, baseContract = storage dir name (and COO from DB)
    const isLotLevel = ["coa", "test-results"].includes(cat);

    const newFilename = generateDocFilename({
      category: cat,
      productName: doc.product_name,
      originalName: doc.filename, // only used for extension
      documentDate,
      lotNumber: isLotLevel ? (storageId ?? undefined) : undefined,
      baseContract: !isLotLevel ? (doc.base_contract ?? storageId ?? undefined) : undefined,
      countryOfOrigin: doc.country_of_origin ?? undefined,
      targetDir: fileDir,
    });

    if (newFilename === doc.filename) {
      // Already correct (shouldn't happen given the regex filter, but be safe)
      skipped++;
      continue;
    }

    const newPath = join(fileDir, newFilename);

    try {
      renameSync(currentPath, newPath);
      updateFilename.run(newFilename, doc.id);
      console.log(`  ✅  ${doc.filename}`);
      console.log(`      → ${newFilename}`);
      renamed++;
    } catch (err) {
      console.error(`  ❌  FAILED ${doc.filename}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  db.close();

  console.log(`\n─────────────────────────────────────`);
  console.log(`Renamed : ${renamed}`);
  console.log(`Skipped : ${skipped}`);
  console.log(`Failed  : ${failed}`);
  console.log(`─────────────────────────────────────\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
