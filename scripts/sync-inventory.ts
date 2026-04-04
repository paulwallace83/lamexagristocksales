/**
 * scripts/sync-inventory.ts — Apply an approved inventory sync (CLI wrapper)
 *
 * Usage: npx tsx scripts/sync-inventory.ts
 *
 * Delegates all logic to lib/sync-apply.ts applySync().
 * This script formats the structured result for terminal output.
 */

import { join, basename } from "path";
import { statSync } from "fs";
import { applySync } from "../lib/sync-apply";

const dataDir = join(process.cwd(), "data");
const proposedPath = join(dataDir, "inventory-proposed.json");
const inventoryPath = join(dataDir, "inventory.json");
const dryRun = process.argv.includes("--dry-run");

try {
  const result = applySync({ proposedPath, inventoryPath, dataDir, dryRun });

  // ── Dry-run summary ─────────────────────────────────────────
  if (result.dryRun) {
    console.log("[DRY RUN] Sync validation passed — no data was modified.\n");
    console.log(`[DRY RUN] Would sync:`);
    console.log(`   ${result.productCount} products`);
    console.log(`   ${result.listingCount} listings`);
    console.log(`   ${result.contractCount} contracts`);
    console.log(`   ${result.lotCount} lots`);
    console.log(`   ${result.warehouseCount} warehouses`);
    console.log(`   ${result.supplierCount} suppliers`);
    process.exit(0);
  }

  // ── Snapshot ────────────────────────────────────────────────
  const snapStat = statSync(result.snapshotPath);
  const snapshotName = basename(result.snapshotPath);
  console.log(`📸 Snapshot saved: data/snapshots/${snapshotName} (${snapStat.size} bytes)`);

  // ── Apply ───────────────────────────────────────────────────
  console.log("✅ inventory.json updated with proposed data");

  // ── Seed report ─────────────────────────────────────────────
  console.log(`\n🔄 SQLite re-seeded (documents + users preserved):`);
  console.log(`   ${result.productCount} products`);
  console.log(`   ${result.listingCount} listings`);
  console.log(`   ${result.contractCount} contracts`);
  console.log(`   ${result.lotCount} lots`);
  console.log(`   ${result.warehouseCount} warehouses`);
  console.log(`   ${result.supplierCount} suppliers`);
  console.log(`   ${result.documentsPreserved} documents preserved`);

  if (result.orphanedDocs.length > 0) {
    console.log(
      `\n⚠️  ${result.orphanedDocs.length} orphaned document(s) (product removed but files preserved):`
    );
    for (const doc of result.orphanedDocs) {
      console.log(`   - "${doc.originalName}" → product ${doc.productId}`);
    }
  }

  // ── Document-lot re-linking ─────────────────────────────────
  if (result.relinkReport.linked > 0 || result.relinkReport.orphaned > 0) {
    console.log(`\n📎 Document-lot re-linking:`);
    if (result.relinkReport.linked > 0) {
      console.log(`   ✅ ${result.relinkReport.linked} association(s) restored`);
    }
    if (result.relinkReport.orphaned > 0) {
      console.log(
        `   ⚠️  ${result.relinkReport.orphaned} lot number(s) not found (lot may have been removed)`
      );
    }
  } else {
    console.log("\n📎 No document-lot associations to re-link.");
  }

  // ── COA re-linking ──────────────────────────────────────────
  if (result.coaRelinkReport.linked > 0 || result.coaRelinkReport.orphaned > 0) {
    console.log(`\n🔬 COA data re-linking:`);
    if (result.coaRelinkReport.linked > 0) {
      console.log(`   ✅ ${result.coaRelinkReport.linked} lot(s) restored`);
    }
    if (result.coaRelinkReport.orphaned > 0) {
      console.log(`   ⚠️  ${result.coaRelinkReport.orphaned} lot(s) not found`);
    }
  }

  // ── New arrivals ────────────────────────────────────────────
  if (result.newArrivals.length > 0) {
    console.log(`\n🆕 ${result.newArrivals.length} new arrival(s) flagged for marketing email`);
  } else {
    console.log("\n🆕 No new arrivals detected (all products existed previously)");
  }

  // ── Reference files ─────────────────────────────────────────
  if (result.referenceFilesRegenerated) {
    console.log(`\n📝 suppliers.md regenerated (${result.supplierCount} suppliers)`);
    console.log(`📝 warehouses.md regenerated (${result.warehouseCount} warehouses)`);
  }

  // ── Discount deduction ──────────────────────────────────────
  const dr = result.deductionReport;
  if (dr.lotsRemoved > 0 || dr.missing > 0) {
    console.log(`\n🏷️  Discount lot deduction:`);
    if (dr.lotsRemoved > 0) {
      console.log(`   ✅ ${dr.lotsRemoved} lot(s) removed from regular inventory`);
      for (const d of dr.details.filter((r) => r.action === "deducted")) {
        console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
      }
    }
    if (dr.listingsEmptied > 0) {
      console.log(`   📦 ${dr.listingsEmptied} listing(s) emptied and removed`);
    }
    if (dr.productsRemoved > 0) {
      console.log(`   🗑️  ${dr.productsRemoved} product(s) removed (all lots discounted)`);
    }
    if (dr.missing > 0) {
      console.log(`   ⚠️  ${dr.missing} discount lot(s) not found in ERP data:`);
      for (const d of dr.details.filter((r) => r.action === "missing")) {
        console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
      }
    }
  }

  // ── Discount validation ─────────────────────────────────────
  if (result.validationReport) {
    const vr = result.validationReport;
    // TODO: Add `totalChecked` to ValidationReport to avoid reconstructing count here
    const activeCount = vr.validated + vr.missing + vr.overlaps.length;
    console.log(
      `\n🏷️  Validating ${activeCount} active discount item(s) against new inventory...`
    );
    if (vr.validated > 0) {
      console.log(`   ✅ ${vr.validated} item(s) validated (stock still present)`);
    }
    if (vr.missing > 0) {
      console.log(
        `   ⚠️  ${vr.missing} item(s) marked as MISSING (stock no longer in inventory):`
      );
      for (const d of vr.details.filter((r) => r.action === "missing")) {
        console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
      }
    }
    if (vr.overlaps.length > 0) {
      console.log(
        `   ℹ️  ${vr.overlaps.length} standalone item(s) may overlap with regular inventory:`
      );
      for (const d of vr.details.filter((r) => r.action === "overlap")) {
        console.log(`      - ${d.id}: ${d.product} — ${d.note}`);
      }
    }
  } else {
    console.log("\n🏷️  No active discount items to validate.");
  }

  // ── Cleanup ─────────────────────────────────────────────────
  if (result.cleanedUp) {
    console.log("\n🧹 Cleaned up data/inventory-proposed.json");
  } else {
    console.warn("⚠️  Could not delete data/inventory-proposed.json — clean up manually");
  }

  console.log("✅ Sync complete!");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`❌ ${msg}`);
  process.exit(1);
}
