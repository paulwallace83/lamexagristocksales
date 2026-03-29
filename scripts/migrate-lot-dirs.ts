/**
 * scripts/migrate-lot-dirs.ts — One-time migration
 *
 * Renames document storage directories from lot-ID to lot-number format
 * and backfills the lot_numbers column in the documents table.
 *
 * Usage: npx tsx scripts/migrate-lot-dirs.ts
 *
 * Safe to run multiple times — skips already-migrated directories.
 */

import { readdirSync, renameSync, existsSync } from "fs";
import { join } from "path";
import { getDb } from "../lib/db";

const db = getDb();
const uploadsRoot = join(process.cwd(), "public", "uploads");

// Build a map of lot ID → lot number from the current database
const lots = db.prepare("SELECT id, lot_number FROM lots").all() as Array<{ id: number; lot_number: string }>;
const lotIdToNumber = new Map<string, string>();
for (const lot of lots) {
  lotIdToNumber.set(String(lot.id), lot.lot_number);
}

console.log(`Found ${lots.length} lots in database`);

// Scan all product upload directories for lot-ID subdirectories
let renamed = 0;
let skipped = 0;

if (existsSync(uploadsRoot)) {
  const productDirs = readdirSync(uploadsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const pid of productDirs) {
    const lotsDir = join(uploadsRoot, pid, "lots");
    if (!existsSync(lotsDir)) continue;

    const subDirs = readdirSync(lotsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dirName of subDirs) {
      // Check if this directory name is a numeric lot ID
      if (/^\d+$/.test(dirName)) {
        const lotNumber = lotIdToNumber.get(dirName);
        if (lotNumber && lotNumber !== dirName) {
          const oldPath = join(lotsDir, dirName);
          const newPath = join(lotsDir, lotNumber);
          if (existsSync(newPath)) {
            console.log(`  ⚠️  Skipping ${pid}/lots/${dirName} → ${lotNumber} (target already exists)`);
            skipped++;
          } else {
            renameSync(oldPath, newPath);
            console.log(`  ✅ ${pid}/lots/${dirName} → ${lotNumber}`);
            renamed++;
          }
        } else if (!lotNumber) {
          console.log(`  ⚠️  ${pid}/lots/${dirName} — lot ID not found in DB (orphaned directory)`);
          skipped++;
        }
      }
      // Non-numeric names are already lot numbers — skip
    }
  }
}

console.log(`\nDirectory migration: ${renamed} renamed, ${skipped} skipped`);

// Backfill lot_numbers column on existing documents
const lotDocs = db.prepare(
  "SELECT d.id, d.product_id, d.category FROM documents d WHERE d.category IN ('coa', 'test-results') AND d.lot_numbers IS NULL",
).all() as Array<{ id: string; product_id: string; category: string }>;

let backfilled = 0;
const updateLotNumbers = db.prepare("UPDATE documents SET lot_numbers = ? WHERE id = ?");

for (const doc of lotDocs) {
  // Try to find which lots this document is associated with by checking document_lots
  const assocLots = db.prepare(
    "SELECT lo.lot_number FROM document_lots dl JOIN lots lo ON lo.id = dl.lot_id WHERE dl.document_id = ?",
  ).all(doc.id) as Array<{ lot_number: string }>;

  if (assocLots.length > 0) {
    updateLotNumbers.run(JSON.stringify(assocLots.map((l) => l.lot_number)), doc.id);
    backfilled++;
    continue;
  }

  // Fallback: extract lot number from the filename (common pattern: lot number in filename)
  // or from the file path (stored under lots/{lotId}/)
  // For now, try to match by looking at the product's lots
  const productLots = db.prepare(
    `SELECT lo.lot_number FROM lots lo
     JOIN listings li ON lo.listing_id = li.id
     WHERE li.product_id = ?`,
  ).all(doc.product_id) as Array<{ lot_number: string }>;

  if (productLots.length === 1) {
    // Only one lot — safe to assume this doc belongs to it
    updateLotNumbers.run(JSON.stringify([productLots[0].lot_number]), doc.id);
    backfilled++;
    console.log(`  📎 ${doc.id} → single lot ${productLots[0].lot_number}`);
  } else {
    console.log(`  ⚠️  ${doc.id} — ${productLots.length} lots for product, manual resolution needed`);
  }
}

console.log(`\nBackfilled lot_numbers on ${backfilled} document(s)`);

// Now re-link document_lots
import { relinkDocumentLots } from "../lib/documents";
const relinkReport = relinkDocumentLots();
console.log(`\nRe-linked: ${relinkReport.linked} association(s), ${relinkReport.orphaned} orphaned`);
