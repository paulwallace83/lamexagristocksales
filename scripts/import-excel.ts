/**
 * scripts/import-excel.ts — Import raw ERP Excel export into inventory-proposed.json
 *
 * Usage: npm run import-excel -- <path-to-xlsx>
 *
 * Reads the Excel file, applies exclusion rules, and writes:
 *   data/inventory-proposed.json  — included stock (feeds into existing sync workflow)
 *   data/import-review.json       — soft-excluded items for user review
 *
 * After running, use the existing diff/sync workflow:
 *   1. Review the import report printed to console
 *   2. Review soft-excluded items in data/import-review.json
 *   3. Run computeDiff() or npm run sync to apply
 */

import { writeFileSync } from "fs";
import { join, resolve } from "path";
import { importExcel, formatReviewSummary, sanitizeReviewForExport } from "../lib/excel-import.js";

const dataDir = join(import.meta.dirname!, "..", "data");

// ─── Parse CLI args ───────────────────────────────────────────────

const excelPath = process.argv[2];
if (!excelPath) {
  console.error("Usage: npm run import-excel -- <path-to-xlsx>");
  console.error("Example: npm run import-excel -- \"C:\\Users\\user\\Downloads\\Book1.xlsx\"");
  process.exit(1);
}

const resolvedPath = resolve(excelPath);
console.log(`\nReading Excel file: ${resolvedPath}\n`);

// ─── Run import ───────────────────────────────────────────────────

let result;
try {
  result = importExcel(resolvedPath, dataDir);
} catch (err) {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

const { included, excluded, review, warnings, stats } = result;

// ─── Write output files ──────────────────────────────────────────

const proposedPath = join(dataDir, "inventory-proposed.json");
writeFileSync(proposedPath, JSON.stringify(included, null, 2), "utf-8");
console.log(`Wrote ${proposedPath}`);

if (review.length > 0) {
  const reviewPath = join(dataDir, "import-review.json");
  writeFileSync(reviewPath, JSON.stringify(sanitizeReviewForExport(review), null, 2), "utf-8");
  console.log(`Wrote ${reviewPath}`);
}

// ─── Print report ────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log("  EXCEL IMPORT REPORT");
console.log("=".repeat(70));

console.log(`\n  Source:          ${resolvedPath}`);
console.log(`  Total rows:      ${fmtNum(stats.totalRows)}`);
console.log(`  Processed rows:  ${fmtNum(stats.activeRows)} (all statuses)`);
console.log(`  Positive weight: ${fmtNum(stats.positiveWeightRows)}`);

console.log(`\n  --- Filtering ---`);
console.log(`  Hard-excluded:   ${fmtNum(stats.hardExcluded)} rows`);
if (Object.keys(stats.hardExclusionBreakdown).length > 0) {
  for (const [reason, count] of Object.entries(stats.hardExclusionBreakdown)) {
    console.log(`    ${reason}: ${count}`);
  }
}
console.log(`  Needs review:    ${fmtNum(stats.softExcluded)} rows`);
if (Object.keys(stats.softExclusionBreakdown).length > 0) {
  for (const [reason, count] of Object.entries(stats.softExclusionBreakdown)) {
    console.log(`    ${reason}: ${count}`);
  }
}

console.log(`\n  --- Included ---`);
console.log(`  Rows:            ${fmtNum(stats.includedRows)}`);
console.log(`  Products:        ${stats.includedProducts}`);
console.log(`  Listings:        ${stats.includedListings}`);
console.log(`  Total weight:    ${fmtNum(stats.includedWeightLbs)} lbs`);
console.log(`  Total quantity:  ${fmtNum(stats.includedQuantity)} units`);

// Warnings
const blocking = warnings.filter((w) => w.requiresAction);
const info = warnings.filter((w) => !w.requiresAction);

if (blocking.length > 0) {
  console.log(`\n  --- Warnings (blocking) ---`);
  // Deduplicate warnings by message
  const seen = new Set<string>();
  for (const w of blocking) {
    if (!seen.has(w.message)) {
      console.log(`  ⚠ ${w.message}`);
      seen.add(w.message);
    }
  }
}

if (info.length > 0) {
  console.log(`\n  --- Warnings (info) ---`);
  const seen = new Set<string>();
  for (const w of info) {
    if (!seen.has(w.message)) {
      console.log(`  ℹ ${w.message}`);
      seen.add(w.message);
    }
  }
}

// Per-product reconciliation table
console.log("\n" + "=".repeat(70));
console.log("  RECONCILIATION — verify against your ERP totals");
console.log("=".repeat(70));
console.log("");
console.log(padRight("Product", 45) + padRight("Qty", 10) + padRight("Weight (lbs)", 15));
console.log("-".repeat(70));

for (const p of included.products) {
  const qty = p.listings.reduce((s, l) => s + l.quantity, 0);
  const wt = p.listings.reduce((s, l) => s + l.weightLbs, 0);
  const name = p.specification
    ? `${p.product} (${p.specification})${p.organic ? " [Org]" : ""}`
    : `${p.product}${p.organic ? " [Org]" : ""}`;
  console.log(
    padRight(name.substring(0, 44), 45) +
    padRight(fmtNum(qty), 10) +
    padRight(fmtNum(Math.round(wt)), 15)
  );
}

const grandQty = included.products.reduce(
  (s, p) => s + p.listings.reduce((s2, l) => s2 + l.quantity, 0), 0
);
const grandWt = included.products.reduce(
  (s, p) => s + p.listings.reduce((s2, l) => s2 + l.weightLbs, 0), 0
);
console.log("-".repeat(70));
console.log(
  padRight("GRAND TOTAL", 45) +
  padRight(fmtNum(grandQty), 10) +
  padRight(fmtNum(Math.round(grandWt)), 15)
);

// Review summary
if (review.length > 0) {
  console.log("\n" + "=".repeat(70));
  console.log("  ITEMS FOR REVIEW");
  console.log("  These were soft-excluded. Review data/import-review.json");
  console.log("  and tell Claude which items to include or exclude.");
  console.log("=".repeat(70));
  console.log("");
  console.log(formatReviewSummary(review));
}

console.log("\n" + "=".repeat(70));
console.log("  NEXT STEPS");
console.log("=".repeat(70));
console.log("  1. Verify reconciliation totals against your ERP report");
console.log("  2. Review soft-excluded items (if any)");
console.log("  3. Tell Claude which review items to include/exclude");
console.log("  4. Run: npm run sync   (to diff and apply)");
console.log("");

// ─── Helpers ──────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}
