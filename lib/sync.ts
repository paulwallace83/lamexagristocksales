/**
 * lib/sync.ts — Weekly Inventory Sync Diff Engine
 *
 * Compares proposed inventory against current inventory.json,
 * validates business rules, and produces a structured diff report.
 * Used by Claude during the weekly paste → diff → approve → apply workflow.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { Product, Listing, InventoryData } from "./inventory";

// ─── Types ────────────────────────────────────────────────────────

export interface SyncDiff {
  date: string;
  summary: SyncSummary;
  products: {
    added: Product[];
    removed: Product[];
    unchanged: string[]; // product IDs
    modified: ProductDiff[];
  };
  references: {
    newSuppliers: PendingSupplier[];
    newWarehouses: PendingWarehouse[];
  };
  warnings: SyncWarning[];
}

export interface SyncSummary {
  totalProductsBefore: number;
  totalProductsAfter: number;
  productsAdded: number;
  productsRemoved: number;
  productsModified: number;
  productsUnchanged: number;
  listingsAdded: number;
  listingsRemoved: number;
  listingsModified: number;
  totalWeightBefore: number;
  totalWeightAfter: number;
  totalQuantityBefore: number;
  totalQuantityAfter: number;
}

export interface ProductDiff {
  productId: string;
  productName: string;
  listings: {
    added: ListingSummary[];
    removed: ListingSummary[];
    modified: ListingDiff[];
  };
}

export interface ListingSummary {
  warehouse: string;
  city: string;
  state: string;
  supplier: string;
  countryOfOrigin: string;
  quantity: number;
  weightLbs: number;
  contracts: string[];
}

export interface ListingDiff {
  warehouse: string;
  supplier: string;
  changes: FieldChange[];
}

export interface FieldChange {
  field: string;
  oldValue: string | number;
  newValue: string | number;
}

export interface PendingSupplier {
  name: string;
  inferredCOO: string | null;
  products: string[];
  tradingCompany: boolean;
}

export interface PendingWarehouse {
  name: string;
  inferredCity: string | null;
  inferredState: string | null;
}

export type SyncWarningType =
  | "missing-coo"
  | "unknown-warehouse"
  | "invalid-unit-type"
  | "unit-type-changed"
  | "probable-duplicate"
  | "customer-name-detected"
  | "missing-bbd"
  | "new-supplier"
  | "new-warehouse"
  | "orphaned-documents";

export interface SyncWarning {
  type: SyncWarningType;
  productId?: string;
  message: string;
  requiresAction: boolean;
}

// ─── Constants ──────────────────────────────────────────────────

/** Valid unit type values (lowercase). Compared case-insensitively. */
export const CANONICAL_UNIT_TYPES = new Set([
  "cases", "lbs", "kgs", "pallets", "drums", "totes", "bags", "boxes", "mt",
]);

// ─── JSON shapes for reference data ──────────────────────────────

interface SupplierJson {
  id: string;
  name: string;
  countryOfOrigin: string;
  products: string[];
  tradingCompany: boolean;
  displayName?: string;
  note?: string;
}

interface WarehouseJson {
  id: string;
  name: string;
  city: string;
  state: string;
  storageType: string;
}

interface SuppliersFile {
  suppliers: SupplierJson[];
}

interface WarehousesFile {
  warehouses: WarehouseJson[];
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Composite key for matching listings across syncs. Uses JSON for collision safety. */
function listingKey(l: { warehouse: string; supplier: string }): string {
  return JSON.stringify({ w: l.warehouse, s: l.supplier });
}

/** Sum weight across all listings in a product array */
function totalWeight(products: Product[]): number {
  return products.reduce(
    (sum, p) => sum + (p.listings || []).reduce((s, l) => s + (l.weightLbs || 0), 0),
    0
  );
}

/** Sum quantity across all listings in a product array */
function totalQuantity(products: Product[]): number {
  return products.reduce(
    (sum, p) => sum + (p.listings || []).reduce((s, l) => s + (l.quantity || 0), 0),
    0
  );
}

function toListingSummary(l: Listing): ListingSummary {
  return {
    warehouse: l.warehouse,
    city: l.city,
    state: l.state,
    supplier: l.supplier,
    countryOfOrigin: l.countryOfOrigin,
    quantity: l.quantity,
    weightLbs: l.weightLbs,
    contracts: l.contracts ?? [],
  };
}

/** Check if two listings have identical data (ignoring id and lots) */
function listingsEqual(a: Listing, b: Listing): boolean {
  return (
    a.quantity === b.quantity &&
    a.weightLbs === b.weightLbs &&
    a.arrived === b.arrived &&
    a.minBBD === b.minBBD &&
    a.countryOfOrigin === b.countryOfOrigin &&
    a.city === b.city &&
    a.state === b.state &&
    JSON.stringify((a.contracts ?? []).sort()) ===
      JSON.stringify((b.contracts ?? []).sort())
  );
}

/** Compute field-level changes between two matched listings */
function diffListings(old: Listing, proposed: Listing): FieldChange[] {
  const changes: FieldChange[] = [];

  if (old.quantity !== proposed.quantity) {
    changes.push({ field: "quantity", oldValue: old.quantity, newValue: proposed.quantity });
  }
  if (old.weightLbs !== proposed.weightLbs) {
    changes.push({ field: "weightLbs", oldValue: old.weightLbs, newValue: proposed.weightLbs });
  }
  if (old.arrived !== proposed.arrived) {
    changes.push({ field: "arrived", oldValue: old.arrived, newValue: proposed.arrived });
  }
  if (old.minBBD !== proposed.minBBD) {
    changes.push({ field: "minBBD", oldValue: old.minBBD, newValue: proposed.minBBD });
  }
  if (old.countryOfOrigin !== proposed.countryOfOrigin) {
    changes.push({ field: "countryOfOrigin", oldValue: old.countryOfOrigin, newValue: proposed.countryOfOrigin });
  }

  const oldContracts = (old.contracts ?? []).sort().join(", ");
  const newContracts = (proposed.contracts ?? []).sort().join(", ");
  if (oldContracts !== newContracts) {
    changes.push({ field: "contracts", oldValue: oldContracts, newValue: newContracts });
  }

  return changes;
}

// ─── Core Diff ───────────────────────────────────────────────────

/** Safely parse a JSON file with descriptive error on failure */
function safeReadJson<T>(filepath: string, label: string): T {
  let raw: string;
  try {
    raw = readFileSync(filepath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read ${label} (${filepath}): ${msg}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${label} (${filepath}): ${msg}`);
  }
}

export function computeDiff(
  currentPath: string,
  proposedPath: string,
  suppliersPath: string,
  warehousesPath: string
): SyncDiff {
  const current = safeReadJson<InventoryData>(currentPath, "current inventory");
  const proposed = safeReadJson<InventoryData>(proposedPath, "proposed inventory");
  const suppliersFile = safeReadJson<SuppliersFile>(suppliersPath, "suppliers");
  const warehousesFile = safeReadJson<WarehousesFile>(warehousesPath, "warehouses");

  // Safely handle missing arrays
  const currentProducts = current.products || [];
  const proposedProducts = proposed.products || [];

  // Index by product ID
  const currentMap = new Map(currentProducts.map((p) => [p.id, p]));
  const proposedMap = new Map(proposedProducts.map((p) => [p.id, p]));

  // Reference lookups
  const suppliersList = suppliersFile.suppliers || [];
  const warehousesList = warehousesFile.warehouses || [];
  const knownSuppliers = new Set(suppliersList.map((s) => s.name));
  const supplierCOOMap = new Map(suppliersList.map((s) => [s.name, s.countryOfOrigin]));
  const knownWarehouses = new Map(warehousesList.map((w) => [w.name, w]));

  const added: Product[] = [];
  const removed: Product[] = [];
  const unchanged: string[] = [];
  const modified: ProductDiff[] = [];
  const warnings: SyncWarning[] = [];
  const newSupplierNames = new Set<string>();
  const newWarehouseNames = new Set<string>();

  let listingsAdded = 0;
  let listingsRemoved = 0;
  let listingsModified = 0;

  // Find added products
  for (const [id, product] of proposedMap) {
    if (!currentMap.has(id)) {
      added.push(product);
      listingsAdded += (product.listings || []).length;
    }
  }

  // Find removed products
  for (const [id, product] of currentMap) {
    if (!proposedMap.has(id)) {
      removed.push(product);
      listingsRemoved += (product.listings || []).length;
    }
  }

  // Find modified/unchanged products
  for (const [id, proposedProduct] of proposedMap) {
    const currentProduct = currentMap.get(id);
    if (!currentProduct) continue; // already handled as "added"

    const currentListings = new Map(
      (currentProduct.listings || []).map((l) => [listingKey(l), l])
    );
    const proposedListings = new Map(
      (proposedProduct.listings || []).map((l) => [listingKey(l), l])
    );

    const addedListings: ListingSummary[] = [];
    const removedListings: ListingSummary[] = [];
    const modifiedListings: ListingDiff[] = [];

    // Listings in proposed but not current
    for (const [key, listing] of proposedListings) {
      if (!currentListings.has(key)) {
        addedListings.push(toListingSummary(listing));
        listingsAdded++;
      }
    }

    // Listings in current but not proposed
    for (const [key, listing] of currentListings) {
      if (!proposedListings.has(key)) {
        removedListings.push(toListingSummary(listing));
        listingsRemoved++;
      }
    }

    // Listings in both — compare fields
    for (const [key, proposedListing] of proposedListings) {
      const currentListing = currentListings.get(key);
      if (!currentListing) continue;

      if (!listingsEqual(currentListing, proposedListing)) {
        const changes = diffListings(currentListing, proposedListing);
        if (changes.length > 0) {
          modifiedListings.push({
            warehouse: proposedListing.warehouse,
            supplier: proposedListing.supplier,
            changes,
          });
          listingsModified++;
        }
      }
    }

    if (
      addedListings.length === 0 &&
      removedListings.length === 0 &&
      modifiedListings.length === 0
    ) {
      unchanged.push(id);
    } else {
      modified.push({
        productId: id,
        productName: proposedProduct.product,
        listings: {
          added: addedListings,
          removed: removedListings,
          modified: modifiedListings,
        },
      });
    }
  }

  // Check for new suppliers and warehouses
  for (const product of proposedProducts) {
    for (const listing of product.listings || []) {
      if (listing.supplier && listing.supplier !== "Various" && !knownSuppliers.has(listing.supplier)) {
        newSupplierNames.add(listing.supplier);
      }
      if (listing.warehouse && !knownWarehouses.has(listing.warehouse)) {
        newWarehouseNames.add(listing.warehouse);
      }
    }
  }

  const newSuppliers: PendingSupplier[] = [...newSupplierNames].map((name) => {
    const products = proposedProducts
      .filter((p) => (p.listings || []).some((l) => l.supplier === name))
      .map((p) => p.product);
    // Try to infer COO from the listing data itself (Claude may have set it during parse)
    const listingWithCOO = proposedProducts
      .flatMap((p) => p.listings || [])
      .find((l) => l.supplier === name && l.countryOfOrigin);
    return {
      name,
      inferredCOO: listingWithCOO?.countryOfOrigin || null,
      products,
      tradingCompany: false,
    };
  });

  const newWarehouses: PendingWarehouse[] = [...newWarehouseNames].map((name) => {
    // Try to infer city/state from listing data
    const listing = proposedProducts
      .flatMap((p) => p.listings || [])
      .find((l) => l.warehouse === name);
    return {
      name,
      inferredCity: listing?.city || null,
      inferredState: listing?.state || null,
    };
  });

  // Business rule validation warnings
  warnings.push(...validateBusinessRules(proposed, suppliersFile, warehousesFile, current));

  // Add warnings for new references
  for (const s of newSuppliers) {
    warnings.push({
      type: "new-supplier",
      message: `New supplier "${s.name}" — COO unknown. Please confirm country of origin.`,
      requiresAction: true,
    });
  }
  for (const w of newWarehouses) {
    if (!w.inferredCity || !w.inferredState) {
      warnings.push({
        type: "new-warehouse",
        message: `New warehouse "${w.name}" — city/state unknown. Please confirm location.`,
        requiresAction: true,
      });
    }
  }

  const summary: SyncSummary = {
    totalProductsBefore: currentProducts.length,
    totalProductsAfter: proposedProducts.length,
    productsAdded: added.length,
    productsRemoved: removed.length,
    productsModified: modified.length,
    productsUnchanged: unchanged.length,
    listingsAdded,
    listingsRemoved,
    listingsModified,
    totalWeightBefore: totalWeight(currentProducts),
    totalWeightAfter: totalWeight(proposedProducts),
    totalQuantityBefore: totalQuantity(currentProducts),
    totalQuantityAfter: totalQuantity(proposedProducts),
  };

  return {
    date: new Date().toISOString().slice(0, 10),
    summary,
    products: { added, removed, unchanged, modified },
    references: { newSuppliers, newWarehouses },
    warnings,
  };
}

// ─── Business Rule Validation ────────────────────────────────────

export function validateBusinessRules(
  proposed: InventoryData,
  suppliers: SuppliersFile,
  warehouses: WarehousesFile,
  current?: InventoryData
): SyncWarning[] {
  const warnings: SyncWarning[] = [];
  const warehouseMap = new Map((warehouses.warehouses || []).map((w) => [w.name, w]));

  for (const product of proposed.products || []) {
    for (const listing of product.listings || []) {
      // COO must be present
      if (!listing.countryOfOrigin || listing.countryOfOrigin.trim() === "") {
        warnings.push({
          type: "missing-coo",
          productId: product.id,
          message: `Missing COO: "${product.product}" at ${listing.warehouse} / ${listing.supplier}`,
          requiresAction: true,
        });
      }

      // Warehouse must have city + state
      if (!listing.city || !listing.state) {
        const known = warehouseMap.get(listing.warehouse);
        if (!known) {
          warnings.push({
            type: "unknown-warehouse",
            productId: product.id,
            message: `Warehouse "${listing.warehouse}" missing city/state for "${product.product}"`,
            requiresAction: true,
          });
        }
      }
    }
  }

  // ── Unit type validation ──────────────────────────────────────
  for (const product of proposed.products || []) {
    const ut = (product.unitType || "").trim();
    if (!ut || !CANONICAL_UNIT_TYPES.has(ut.toLowerCase())) {
      warnings.push({
        type: "invalid-unit-type",
        productId: product.id,
        message: `Invalid unit type "${ut || "(empty)"}" on "${product.product}" (${product.id})`,
        requiresAction: false,
      });
    }
  }

  // ── Unit type change detection ────────────────────────────────
  if (current) {
    const currentUnitTypes = new Map(
      (current.products || []).map((p) => [p.id, p.unitType])
    );
    for (const product of proposed.products || []) {
      const prev = currentUnitTypes.get(product.id);
      if (typeof prev === "string" && prev && (product.unitType || "").toLowerCase() !== prev.toLowerCase()) {
        warnings.push({
          type: "unit-type-changed",
          productId: product.id,
          message: `Unit type changed for "${product.product}" (${product.id}): "${prev}" → "${product.unitType}"`,
          requiresAction: false,
        });
      }
    }
  }

  // ── Probable duplicate detection ──────────────────────────────
  const dupeGroups = new Map<string, { id: string; name: string }[]>();
  for (const product of proposed.products || []) {
    // TODO: "|" separator could cause false collisions if field values contain "|".
    // Switch to JSON.stringify([...]) if this ever becomes an issue. (B001 review finding)
    const key = [
      (product.commodity || "").toLowerCase(),
      (product.format || "").toLowerCase(),
      (product.specification ?? "").toLowerCase(),
      String(product.organic),
    ].join("|");
    const group = dupeGroups.get(key);
    const entry = { id: product.id, name: product.product };
    if (group) {
      group.push(entry);
    } else {
      dupeGroups.set(key, [entry]);
    }
  }
  for (const group of dupeGroups.values()) {
    if (group.length >= 2) {
      const ids = group.map((g) => `"${g.name}" (${g.id})`).join(", ");
      warnings.push({
        type: "probable-duplicate",
        message: `Probable duplicate products: ${ids}`,
        requiresAction: false,
      });
    }
  }

  return warnings;
}

// ─── Diff Report Formatting ─────────────────────────────────────

export function formatDiffReport(diff: SyncDiff): string {
  const s = diff.summary;
  const lines: string[] = [];

  lines.push(`## Inventory Sync Report — ${diff.date}`);
  lines.push("");

  // Summary
  lines.push("### Summary");
  lines.push(
    `- **Products:** ${s.totalProductsBefore} → ${s.totalProductsAfter} ` +
      `(+${s.productsAdded} added, -${s.productsRemoved} removed, ${s.productsModified} modified, ${s.productsUnchanged} unchanged)`
  );
  lines.push(
    `- **Listings:** +${s.listingsAdded} added, -${s.listingsRemoved} removed, ${s.listingsModified} modified`
  );
  lines.push(
    `- **Total weight:** ${fmtLbs(s.totalWeightBefore)} → ${fmtLbs(s.totalWeightAfter)} ` +
      `(${s.totalWeightAfter >= s.totalWeightBefore ? "+" : ""}${fmtLbs(s.totalWeightAfter - s.totalWeightBefore)})`
  );
  lines.push(
    `- **Total quantity:** ${fmtNum(s.totalQuantityBefore)} → ${fmtNum(s.totalQuantityAfter)} units`
  );
  lines.push("");

  // New products
  if (diff.products.added.length > 0) {
    lines.push("### 🟢 New Products");
    lines.push("");
    lines.push("| Product | Commodity | Format | Type | Listings | Weight |");
    lines.push("|---------|-----------|--------|------|----------|--------|");
    for (const p of diff.products.added) {
      const wt = p.listings.reduce((s, l) => s + l.weightLbs, 0);
      lines.push(
        `| ${p.product}${p.specification ? ` (${p.specification})` : ""} | ${p.commodity} | ${p.format} | ${p.organic ? "Organic" : "Conv"} | ${p.listings.length} | ${fmtLbs(wt)} |`
      );
    }
    lines.push("");
  }

  // Removed products
  if (diff.products.removed.length > 0) {
    lines.push("### 🔴 Removed Products");
    lines.push("");
    lines.push("| Product | Commodity | Format | Listings | Weight |");
    lines.push("|---------|-----------|--------|----------|--------|");
    for (const p of diff.products.removed) {
      const wt = p.listings.reduce((s, l) => s + l.weightLbs, 0);
      lines.push(
        `| ${p.product}${p.specification ? ` (${p.specification})` : ""} | ${p.commodity} | ${p.format} | ${p.listings.length} | ${fmtLbs(wt)} |`
      );
    }
    lines.push("");
  }

  // Modified products
  if (diff.products.modified.length > 0) {
    lines.push("### 🟡 Modified Products");
    lines.push("");
    for (const pd of diff.products.modified) {
      lines.push(`**${pd.productName}** (\`${pd.productId}\`)`);
      for (const added of pd.listings.added) {
        lines.push(
          `  - ➕ NEW listing: ${added.warehouse}, ${added.city} ${added.state} / ${added.supplier} (${added.countryOfOrigin}): ${fmtNum(added.quantity)} units, ${fmtLbs(added.weightLbs)}`
        );
      }
      for (const removed of pd.listings.removed) {
        lines.push(
          `  - ➖ REMOVED: ${removed.warehouse} / ${removed.supplier}: ${fmtNum(removed.quantity)} units, ${fmtLbs(removed.weightLbs)}`
        );
      }
      for (const mod of pd.listings.modified) {
        const changeStr = mod.changes
          .map((c) => `${c.field}: ${c.oldValue} → ${c.newValue}`)
          .join(", ");
        lines.push(`  - ✏️ ${mod.warehouse} / ${mod.supplier}: ${changeStr}`);
      }
      lines.push("");
    }
  }

  // Blocking warnings
  const blocking = diff.warnings.filter((w) => w.requiresAction);
  if (blocking.length > 0) {
    lines.push("### ⚠️ Requires Attention (blocking)");
    lines.push("");
    for (const w of blocking) {
      lines.push(`- ⚠️ ${w.message}`);
    }
    lines.push("");
  }

  // Non-blocking warnings
  const info = diff.warnings.filter((w) => !w.requiresAction);
  if (info.length > 0) {
    lines.push("### ℹ️ Informational");
    lines.push("");
    for (const w of info) {
      lines.push(`- ℹ️ ${w.message}`);
    }
    lines.push("");
  }

  // No changes
  if (
    diff.products.added.length === 0 &&
    diff.products.removed.length === 0 &&
    diff.products.modified.length === 0
  ) {
    lines.push("### ✅ No Changes Detected");
    lines.push("");
    lines.push("Proposed inventory matches current inventory exactly.");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Reconciliation Report ──────────────────────────────────────

export function reconciliationReport(inventoryPath: string): string {
  const inventory = safeReadJson<InventoryData>(inventoryPath, "inventory");
  const products = inventory.products || [];

  const lines: string[] = [];
  lines.push("## Reconciliation Report");
  lines.push("");
  lines.push("| Product | Unit Type | Total Qty | Total Weight (lbs) |");
  lines.push("|---------|-----------|-----------|-------------------|");

  let grandQty = 0;
  let grandWeight = 0;

  for (const p of products) {
    const listings = p.listings || [];
    const qty = listings.reduce((s, l) => s + (l.quantity || 0), 0);
    const wt = listings.reduce((s, l) => s + (l.weightLbs || 0), 0);
    grandQty += qty;
    grandWeight += wt;
    const name = p.specification
      ? `${p.product} (${p.specification})${p.organic ? " — Organic" : ""}`
      : `${p.product}${p.organic ? " — Organic" : ""}`;
    lines.push(`| ${name} | ${p.unitType} | ${fmtNum(qty)} | ${fmtLbs(wt)} |`);
  }

  lines.push(`| **GRAND TOTAL** | | **${fmtNum(grandQty)}** | **${fmtLbs(grandWeight)}** |`);
  lines.push("");
  const totalListings = products.reduce((s, p) => s + (p.listings || []).length, 0);
  lines.push(`_${products.length} products, ${totalListings} listings_`);

  return lines.join("\n");
}

// ─── Product ID Generation ──────────────────────────────────────

export function generateProductId(
  commodity: string,
  format: string,
  specification: string | null,
  organic: boolean,
  variety: string | null
): string {
  const parts: string[] = [];

  // Commodity
  parts.push(slugify(commodity));

  // Format abbreviation
  if (format === "Juice Concentrate") parts.push("jc");
  else if (format === "IQF") parts.push("iqf");
  else if (format === "Puree") parts.push("puree");
  else parts.push(slugify(format));

  // Specification
  if (specification) {
    parts.push(slugify(specification));
  }

  // Variety
  if (variety) {
    parts.push(slugify(variety));
  }

  // Organic
  if (organic) {
    parts.push("organic");
  }

  return parts.join("-");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtLbs(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " lbs";
}
