/**
 * lib/excel-import.ts — Excel Import with Exclusion Rules
 *
 * Parses raw ERP Excel exports into the inventory JSON structure,
 * applying hard/soft exclusion rules and stripping sensitive data.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import type { Product, Listing, Lot, InventoryData } from "./inventory.js";

// ─── Product ID Generation (inlined to avoid importing sync.ts in Next.js) ──

export function generateProductId(
  commodity: string,
  format: string,
  specification: string | null,
  organic: boolean,
  variety: string | null
): string {
  const parts: string[] = [slugify(commodity)];
  if (format === "Juice Concentrate") parts.push("jc");
  else if (format === "IQF") parts.push("iqf");
  else if (format === "Puree") parts.push("puree");
  else parts.push(slugify(format));
  if (specification) parts.push(slugify(specification));
  if (variety) parts.push(slugify(variety));
  if (organic) parts.push("organic");
  return parts.join("-");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface SyncWarning {
  type: string;
  productId?: string;
  message: string;
  requiresAction: boolean;
}

// ─── Types ────────────────────────────────────────────────────────

export interface ExclusionRules {
  hardExclusions: {
    customers: string[];
    customerProductCombos: { customer: string; productContains: string }[];
    brandedProductPatterns: string[];
    nonInventoryPatterns?: string[];
  };
  softExclusions: {
    directCustomerKeywords: string[];
    treatAsAvailable: string[];
  };
}

export interface ExcelRow {
  Stock_Contract: string;
  Stock_Contract_Status: string;
  Stock_Contract_Customer: string;
  Stock_Contract_Supplier: string;
  Stock_ArrivalDate: number | string;
  Stock_BestBefore: number | string;
  Stock_ProductionDate: number | string;
  Stock_Description: string;
  Stock_Specification: string;
  Brand: string;
  Qty_Cases: number;
  Qty_Weight: number;
  Qty_Weight_Net_Bal: number;
  Unit: string;
  Stock_Cold_Store: string;
  Stock_Cold_Store_Addr2: string;
  Stock_Origin_Country: string;
  Stock_Reserved: string;
  Stock_Comments: string;
  SML_LotNumber: string;
  [key: string]: unknown; // other columns we don't use
}

export interface ExcludedRow {
  row: ExcelRow;
  reason: string;
  ruleType: "hard" | "soft";
}

export interface ImportResult {
  included: InventoryData;
  excluded: ExcludedRow[];
  review: ExcludedRow[];
  warnings: SyncWarning[];
  stats: ImportStats;
}

export interface ImportStats {
  totalRows: number;
  activeRows: number;
  positiveWeightRows: number;
  hardExcluded: number;
  softExcluded: number;
  includedRows: number;
  includedProducts: number;
  includedListings: number;
  includedWeightLbs: number;
  includedQuantity: number;
  hardExclusionBreakdown: Record<string, number>;
  softExclusionBreakdown: Record<string, number>;
}

// ─── Warehouse Normalization ──────────────────────────────────────

interface WarehouseJson {
  id: string;
  name: string;
  city: string;
  state: string;
  storageType: string;
}

interface WarehousesFile {
  warehouses: WarehouseJson[];
}

/**
 * Build a lookup that maps various raw cold store names to canonical warehouse entries.
 * Uses case-insensitive prefix matching and known aliases.
 */
function buildWarehouseLookup(warehouses: WarehouseJson[]): Map<string, WarehouseJson> {
  const lookup = new Map<string, WarehouseJson>();

  // Exact matches (lowercased)
  for (const w of warehouses) {
    lookup.set(w.name.toLowerCase(), w);
  }

  // Known aliases from the Excel data
  const aliases: Record<string, string> = {
    "newark refrigerated warehouse": "Newark Refrigerated Warehouse",
    "promate produce vernon ca": "Promate Produce",
    "corex alliance": "Corex Alliance",
    "first choice freezer": "First Choice Freezer",
    "cool port - oakland (lineage)": "Cool Port - Oakland (Lineage)",
    "us cold storage plant #1 - laredo tx": "US Cold Storage Plant #1",
    "us cold storage plant #1-laredo tx": "US Cold Storage Plant #1",
    "us cold - laredo, tx  - plant #2": "US Cold Storage Plant #1",
    "sun tropical foods - laredo plant 1": "US Cold Storage Plant #1",
    "flexcold - jacksonville, fl": "Flexcold",
    "velocity usa / dry warehouse": "Velocity USA / Dry Warehouse",
    "americold - vineland, nj": "First Choice Freezer",
    "kres coldstore": "Kres Coldstore",
  };

  for (const [alias, canonical] of Object.entries(aliases)) {
    const w = warehouses.find((wh) => wh.name === canonical);
    if (w) lookup.set(alias, w);
  }

  return lookup;
}

function resolveWarehouse(
  rawName: string,
  addr2: string,
  lookup: Map<string, WarehouseJson>
): { warehouse: string; city: string; state: string } | null {
  if (!rawName) return null;

  const key = rawName.toLowerCase().trim();

  // Direct lookup
  const direct = lookup.get(key);
  if (direct) return { warehouse: direct.name, city: direct.city, state: direct.state };

  // Try prefix matching (e.g., "US Cold Storage Plant #1 - Laredo TX" → "US Cold Storage Plant #1")
  for (const [alias, wh] of lookup) {
    if (key.startsWith(alias) || alias.startsWith(key)) {
      return { warehouse: wh.name, city: wh.city, state: wh.state };
    }
  }

  // Fall back: parse city/state from addr2 (e.g., "NEWARK, NJ" or "Oakland, CA 94621")
  let city = "";
  let state = "";
  if (addr2) {
    const match = addr2.match(/^([^,]+),\s*([A-Z]{2})/i);
    if (match) {
      city = titleCase(match[1].trim());
      state = match[2].toUpperCase();
    }
  }

  return { warehouse: titleCase(rawName), city, state };
}

// ─── Supplier Normalization ───────────────────────────────────────

interface SupplierJson {
  id: string;
  name: string;
  countryOfOrigin: string;
  products: string[];
  tradingCompany: boolean;
  displayName?: string;
}

interface SuppliersFile {
  suppliers: SupplierJson[];
}

function buildSupplierLookup(suppliers: SupplierJson[]): Map<string, SupplierJson> {
  const lookup = new Map<string, SupplierJson>();
  for (const s of suppliers) {
    lookup.set(s.name.toLowerCase(), s);
  }
  return lookup;
}

function resolveSupplier(
  rawName: string,
  supplierLookup: Map<string, SupplierJson>
): { supplier: string; countryOfOrigin: string; tradingCompany: boolean } | null {
  if (!rawName) return null;

  const key = rawName.toLowerCase().trim().replace(/\s+/g, " ");

  // Direct match (normalize whitespace for both sides)
  for (const [k, s] of supplierLookup) {
    const nk = k.replace(/\s+/g, " ");
    if (key === nk || key.includes(nk) || nk.includes(key)) {
      return {
        supplier: s.tradingCompany ? (s.displayName || "Various") : s.name,
        countryOfOrigin: s.countryOfOrigin,
        tradingCompany: s.tradingCompany,
      };
    }
  }

  return null;
}

// ─── COO Normalization ────────────────────────────────────────────

function normalizeCOO(raw: string): string {
  if (!raw) return "";
  const upper = raw.toUpperCase().trim();
  const cooMap: Record<string, string> = {
    "THE PEOPLES REPUBLIC OF CHINA": "China",
    "CHINA": "China",
    "TURKEY": "Turkey",
    "CHILE": "Chile",
    "SERBIA": "Serbia",
    "PERU": "Peru",
    "ECUADOR": "Ecuador",
    "ITALY": "Italy",
    "ARGENTINA": "Argentina",
    "SOUTH AFRICA": "South Africa",
    "THAILAND": "Thailand",
    "BRAZIL": "Brazil",
    "MEXICO": "Mexico",
    "EGYPT": "Egypt",
    "GREECE": "Greece",
    "MOROCCO": "Morocco",
    "GUATEMALA": "Guatemala",
    "COSTA RICA": "Costa Rica",
    "U.S.A.": "USA",
    "UNITED STATES": "USA",
    "CANADA": "Canada",
    "SPAIN": "Spain",
    "BELGIUM": "Belgium",
    "NETHERLANDS": "Netherlands",
    "(N/A)": "",
  };
  return cooMap[upper] || titleCase(raw);
}

// ─── Date Conversion ──────────────────────────────────────────────

/** Convert Excel serial date number to ISO date string, or pass through text dates */
function excelDateToISO(val: number | string): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" && val > 30000) {
    // Excel serial date (days since 1899-12-30)
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  return String(val);
}

// ─── Product Description Parser ───────────────────────────────────

interface ParsedProduct {
  product: string; // Display name (e.g., "Apple Juice Concentrate")
  commodity: string;
  category: string; // "Fruit" or "Vegetable"
  format: string; // "Juice Concentrate", "IQF", "Puree", etc.
  processType: string;
  specification: string | null;
  variety: string | null;
  organic: boolean;
  unitType: string;
}

const VEGETABLES = new Set([
  "spinach", "beans", "brussels sprouts", "broccoli", "okra",
  "peas", "corn", "carrot", "cauliflower", "asparagus",
]);

const FORMAT_ABBREVS: Record<string, string> = {
  "jc": "Juice Concentrate",
  "juice concentrate": "Juice Concentrate",
  "juice conc.": "Juice Concentrate",
  "juice conc": "Juice Concentrate",
  "iqf": "IQF",
  "puree": "Puree",
};

const PROCESS_TYPE_MAP: Record<string, string> = {
  "Juice Concentrate": "Aseptic",
  "IQF": "Frozen",
  "Puree": "Frozen",
};

/** Normalize specification strings so variants like "70 Brix" / "70 Bx" / "70Bx" merge. */
function normalizeSpec(spec: string | null): string | null {
  if (!spec) return null;
  let s = spec
    .replace(/\b(\d+)\s*Bx\b/i, "$1 Brix")      // "70 Bx" → "70 Brix"
    .replace(/\b(\d+)Bx\b/i, "$1 Brix")           // "70Bx" → "70 Brix"
    .replace(/\b(\d+)\s*brix\b/i, "$1 Brix")      // "70 brix" → "70 Brix"
    .replace(/\b(\d+)\s*GPL\b/i, "$1 GPL")         // "400gpl" → "400 GPL"
    .replace(/\.\s*$/, "")                          // trailing period
    .replace(/,\s*$/, "")                           // trailing comma
    .trim();
  return s || null;
}

function parseProductDescription(
  description: string,
  specField: string
): ParsedProduct {
  if (!description) {
    return {
      product: "Unknown Product",
      commodity: "Unknown",
      category: "Fruit",
      format: "Unknown",
      processType: "Unknown",
      specification: null,
      variety: null,
      organic: false,
      unitType: "cases",
    };
  }

  // Handle "Pear Juice Concentrate 70 Brix" style (no commas)
  const hasCommas = description.includes(",");
  let parts: string[];
  if (hasCommas) {
    parts = description.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    parts = description.split(/\s+/);
  }

  let commodity = "";
  let format = "";
  let specification: string | null = null;
  let variety: string | null = null;
  let organic = false;
  let processType = "";

  // Check specField for organic indicators
  const specLower = (specField || "").toLowerCase();
  if (specLower.includes("organic") || specLower.includes("nop")) {
    organic = true;
  }

  if (hasCommas) {
    // Comma-separated: "Apple, JC, Aseptic, Medium Acid"
    commodity = parts[0];

    // Find format in remaining parts
    const specParts: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const lower = parts[i].toLowerCase().replace(/[.,]/g, "");

      // Handle compound tokens like "Puree Seedless" → format "Puree" + spec "Seedless"
      const lowerWords = lower.split(/\s+/);
      const firstWord = lowerWords[0];
      if (!format && FORMAT_ABBREVS[firstWord] && lowerWords.length > 1) {
        format = FORMAT_ABBREVS[firstWord];
        specParts.push(lowerWords.slice(1).map(w => titleCase(w)).join(" "));
        continue;
      }

      if (FORMAT_ABBREVS[lower]) {
        format = FORMAT_ABBREVS[lower];
      } else if (lower === "nop" || lower === "org" || lower === "organic") {
        organic = true;
      } else if (lower.startsWith("grade")) {
        // Strip grades per CLAUDE.md
        continue;
      } else if (lower === "aseptic" || lower === "frozen") {
        processType = titleCase(lower);
      } else if (
        lower === "whole" || lower === "diced" || lower === "chunks" ||
        lower === "sliced" || lower === "chopped" || lower === "dices" ||
        lower === "cultivated" || lower === "wild" || lower === "seedless" ||
        lower === "florets & stalks"
      ) {
        specParts.push(parts[i]);
      } else if (
        lower.includes("brix") || lower.includes("bx") || lower.includes("gpl") ||
        lower.includes("mm") || lower.includes("mesh") || lower.includes("3/8")
      ) {
        specParts.push(parts[i]);
      } else if (lower !== "conventional" && lower !== "conv") {
        // Could be variety (Kent, Red, Green, etc.) or additional spec
        if (!variety && (
          lower === "kent" || lower === "red" || lower === "green" ||
          lower === "dark sweet" || lower === "clingstone" || lower === "medium"
        )) {
          variety = parts[i];
        } else {
          specParts.push(parts[i]);
        }
      }
    }

    specification = specParts.length > 0 ? specParts.join(", ").replace(/,\s*$/, "") : null;
  } else {
    // Space-separated: "Pear Juice Concentrate 70 Brix"
    // Try to find the format keywords
    const descLower = description.toLowerCase();
    if (descLower.includes("juice concentrate") || descLower.includes("juice conc")) {
      format = "Juice Concentrate";
      const jcIdx = descLower.indexOf("juice conc");
      commodity = description.substring(0, jcIdx).trim();
      const afterJC = description.substring(jcIdx).replace(/juice concentrate|juice conc\.?/i, "").trim();
      if (afterJC) specification = afterJC;
    } else if (descLower.includes("iqf")) {
      format = "IQF";
      const iqfIdx = descLower.indexOf("iqf");
      commodity = description.substring(0, iqfIdx).trim();
      const afterIQF = description.substring(iqfIdx + 3).trim();
      if (afterIQF) specification = afterIQF;
    } else if (descLower.includes("puree")) {
      format = "Puree";
      const purIdx = descLower.indexOf("puree");
      commodity = description.substring(0, purIdx).trim();
      const afterPuree = description.substring(purIdx + 5).trim();
      if (afterPuree) specification = afterPuree;
    } else {
      // Can't parse format — use entire description as product name
      commodity = description;
      format = "Other";
    }
  }

  // Clean up commodity
  commodity = commodity.replace(/,\s*$/, "").trim();

  // Determine process type
  if (!processType) {
    processType = PROCESS_TYPE_MAP[format] || "Other";
  }

  // Handle specification from specField if we don't have one
  if (!specification && specField && specField !== "Conventional" && specField !== "Grade A" && specField !== "Grade B") {
    const cleanSpec = specField
      .replace(/\bgrade\s*[a-z]\b/gi, "")
      .replace(/\bconventional\b/gi, "")
      .replace(/\borganic\b/gi, "")
      .replace(/\bnop\b/gi, "")
      .trim()
      .replace(/^[,.\s]+|[,.\s]+$/g, "");
    if (cleanSpec) specification = cleanSpec;
  }

  // Determine category
  const commodityLower = commodity.toLowerCase();
  const category = VEGETABLES.has(commodityLower) ? "Vegetable" : "Fruit";

  // Build display product name
  let product = `${commodity} ${format === "Juice Concentrate" ? "Juice Concentrate" : format}`;
  if (format === "Puree") {
    product = `${commodity} Puree`;
  }

  // Unit type
  let unitType = "cases";
  if (format === "Juice Concentrate" || format === "Puree") {
    unitType = "drums";
  } else if (format === "IQF") {
    unitType = "cases";
  }

  return {
    product: product.trim(),
    commodity,
    category,
    format,
    processType,
    specification: normalizeSpec(specification),
    variety: variety || null,
    organic,
    unitType,
  };
}

// ─── Exclusion Engine ─────────────────────────────────────────────

function checkHardExclusion(
  row: ExcelRow,
  rules: ExclusionRules
): string | null {
  const customer = (row.Stock_Contract_Customer || "").toUpperCase();
  const description = row.Stock_Description || "";

  // Customer-based exclusions
  for (const pattern of rules.hardExclusions.customers) {
    if (customer.includes(pattern.toUpperCase())) {
      return `customer-excluded: ${pattern}`;
    }
  }

  // Customer + product combos
  for (const combo of rules.hardExclusions.customerProductCombos) {
    if (
      customer.includes(combo.customer.toUpperCase()) &&
      description.toLowerCase().includes(combo.productContains.toLowerCase())
    ) {
      return `customer-product-combo: ${combo.customer} / ${combo.productContains}`;
    }
  }

  // Branded product patterns
  for (const pattern of rules.hardExclusions.brandedProductPatterns) {
    if (description.includes(pattern)) {
      return `branded-product: ${pattern}`;
    }
  }

  // Non-inventory patterns (e.g., DFRM prepayment rows)
  for (const pattern of rules.hardExclusions.nonInventoryPatterns || []) {
    if (description.toUpperCase().includes(pattern.toUpperCase())) {
      return `non-inventory: ${pattern.trim()}`;
    }
  }

  // Zero/negative net balance weight
  const netBal = Number(row.Qty_Weight_Net_Bal) || 0;
  if (netBal <= 0) {
    return "zero-or-negative-weight";
  }

  return null;
}

function checkSoftExclusion(
  row: ExcelRow,
  rules: ExclusionRules
): string | null {
  const customer = (row.Stock_Contract_Customer || "").toUpperCase();

  // Check if this is a "treat as available" customer
  for (const pattern of rules.softExclusions.treatAsAvailable) {
    if (customer.includes(pattern.toUpperCase())) {
      return null; // Available — no soft exclusion
    }
  }

  // Reserved stock
  if (row.Stock_Reserved === "Reserved") {
    return `reserved-stock: ${row.Stock_Contract_Customer}`;
  }

  // Direct customer (doesn't contain any "available" keyword)
  return `direct-customer: ${row.Stock_Contract_Customer}`;
}

// ─── Main Import Function ─────────────────────────────────────────

export function importExcel(
  excelPath: string,
  dataDir: string
): ImportResult {
  // Load reference data
  const suppliersFile = JSON.parse(
    readFileSync(join(dataDir, "suppliers.json"), "utf-8")
  ) as SuppliersFile;
  const warehousesFile = JSON.parse(
    readFileSync(join(dataDir, "warehouses.json"), "utf-8")
  ) as WarehousesFile;
  const rules = JSON.parse(
    readFileSync(join(dataDir, "exclusion-rules.json"), "utf-8")
  ) as ExclusionRules;

  // Build lookups
  const warehouseLookup = buildWarehouseLookup(warehousesFile.warehouses);
  const supplierLookup = buildSupplierLookup(suppliersFile.suppliers);

  // Read Excel
  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const allRows = XLSX.utils.sheet_to_json<ExcelRow>(wb.Sheets[sheetName]);

  const excluded: ExcludedRow[] = [];
  const review: ExcludedRow[] = [];
  const includedRows: ExcelRow[] = [];
  const warnings: SyncWarning[] = [];
  const hardBreakdown: Record<string, number> = {};
  const softBreakdown: Record<string, number> = {};

  // Process all rows (all statuses) — exclusion rules handle filtering
  for (const row of allRows) {
    // Hard exclusion check
    const hardReason = checkHardExclusion(row, rules);
    if (hardReason) {
      excluded.push({ row, reason: hardReason, ruleType: "hard" });
      const cat = hardReason.split(":")[0];
      hardBreakdown[cat] = (hardBreakdown[cat] || 0) + 1;
      continue;
    }

    // Soft exclusion check
    const softReason = checkSoftExclusion(row, rules);
    if (softReason) {
      review.push({ row, reason: softReason, ruleType: "soft" });
      const cat = softReason.split(":")[0];
      softBreakdown[cat] = (softBreakdown[cat] || 0) + 1;
      continue;
    }

    includedRows.push(row);
  }

  // Aggregate included rows into products → listings
  const productMap = new Map<string, {
    parsed: ParsedProduct;
    listingMap: Map<string, {
      warehouse: string;
      city: string;
      state: string;
      supplier: string;
      countryOfOrigin: string;
      quantity: number;
      weightLbs: number;
      arrived: string;
      minBBD: string;
      contracts: Set<string>;
      lots: Lot[];
    }>;
  }>();

  let lotIdCounter = 1;

  for (const row of includedRows) {
    const parsed = parseProductDescription(row.Stock_Description, row.Stock_Specification);

    const productId = generateProductId(
      parsed.commodity,
      parsed.format,
      parsed.specification,
      parsed.organic,
      parsed.variety
    );

    if (!productMap.has(productId)) {
      productMap.set(productId, { parsed, listingMap: new Map() });
    }

    const entry = productMap.get(productId)!;

    // Resolve warehouse
    const wh = resolveWarehouse(row.Stock_Cold_Store, row.Stock_Cold_Store_Addr2, warehouseLookup);
    if (!wh) {
      warnings.push({
        type: "unknown-warehouse",
        productId,
        message: `Cannot resolve warehouse "${row.Stock_Cold_Store}" for "${row.Stock_Description}"`,
        requiresAction: true,
      });
      continue;
    }

    // Resolve supplier
    const resolved = resolveSupplier(row.Stock_Contract_Supplier, supplierLookup);
    const supplierName = resolved?.supplier || titleCase(row.Stock_Contract_Supplier || "Unknown");
    const coo = resolved?.countryOfOrigin || normalizeCOO(row.Stock_Origin_Country);

    if (!coo) {
      warnings.push({
        type: "missing-coo",
        productId,
        message: `Missing COO for "${row.Stock_Description}" at ${wh.warehouse} / ${supplierName}`,
        requiresAction: true,
      });
    }

    // Check for unresolved warehouse
    if (!wh.city || !wh.state) {
      warnings.push({
        type: "unknown-warehouse",
        productId,
        message: `Warehouse "${wh.warehouse}" missing city/state for "${row.Stock_Description}"`,
        requiresAction: true,
      });
    }

    // Check for new supplier
    if (!resolved) {
      warnings.push({
        type: "new-supplier" as any,
        productId,
        message: `New supplier "${row.Stock_Contract_Supplier}" for "${row.Stock_Description}" — COO: ${coo || "unknown"}`,
        requiresAction: !coo,
      });
    }

    // Listing key
    const listingKey = JSON.stringify({ w: wh.warehouse, s: supplierName });

    if (!entry.listingMap.has(listingKey)) {
      entry.listingMap.set(listingKey, {
        warehouse: wh.warehouse,
        city: wh.city,
        state: wh.state,
        supplier: supplierName,
        countryOfOrigin: coo,
        quantity: 0,
        weightLbs: 0,
        arrived: excelDateToISO(row.Stock_ArrivalDate),
        minBBD: "",
        contracts: new Set(),
        lots: [],
      });
    }

    const listing = entry.listingMap.get(listingKey)!;

    // Accumulate quantity and weight (use Net Balance — matches ERP totals)
    const cases = Number(row.Qty_Cases) || 0;
    const netBal = Number(row.Qty_Weight_Net_Bal) || 0;
    listing.quantity += Math.abs(cases);
    listing.weightLbs += netBal;

    // Track contract
    if (row.Stock_Contract) {
      listing.contracts.add(String(row.Stock_Contract));
    }

    // Track earliest arrival and earliest BBD
    const arrivalISO = excelDateToISO(row.Stock_ArrivalDate);
    if (arrivalISO && (!listing.arrived || arrivalISO < listing.arrived)) {
      listing.arrived = arrivalISO;
    }
    const bbdISO = excelDateToISO(row.Stock_BestBefore);
    if (bbdISO && (!listing.minBBD || bbdISO < listing.minBBD)) {
      listing.minBBD = bbdISO;
    }

    // Add lot if lot number exists
    if (row.SML_LotNumber) {
      listing.lots.push({
        id: lotIdCounter++,
        lotNumber: row.SML_LotNumber,
        quantity: Math.abs(cases),
        weightLbs: netBal,
        bbd: bbdISO,
        contracts: row.Stock_Contract ? [String(row.Stock_Contract)] : [],
      });
    }
  }

  // Build final products array
  const products: Product[] = [];
  let totalIncludedWeight = 0;
  let totalIncludedQty = 0;
  let totalListings = 0;

  for (const [productId, entry] of productMap) {
    const listings: Listing[] = [];
    let listingId = 1;

    for (const [, l] of entry.listingMap) {
      listings.push({
        id: listingId++,
        warehouse: l.warehouse,
        city: l.city,
        state: l.state,
        supplier: l.supplier,
        countryOfOrigin: l.countryOfOrigin,
        quantity: l.quantity,
        weightLbs: Math.round(l.weightLbs * 100) / 100,
        arrived: l.arrived,
        minBBD: l.minBBD,
        contracts: [...l.contracts].sort(),
        lots: l.lots,
      });

      totalIncludedWeight += l.weightLbs;
      totalIncludedQty += l.quantity;
      totalListings++;
    }

    const p = entry.parsed;
    products.push({
      id: productId,
      product: p.product,
      commodity: p.commodity,
      category: p.category,
      format: p.format,
      processType: p.processType,
      specification: p.specification,
      variety: p.variety,
      grade: null,
      organic: p.organic,
      certifications: p.organic ? ["Organic"] : [],
      packSize: inferPackSize(p.format, p.unitType),
      unitType: p.unitType,
      listings,
    });
  }

  // Sort products by commodity then name
  products.sort((a, b) => a.commodity.localeCompare(b.commodity) || a.product.localeCompare(b.product));

  const stats: ImportStats = {
    totalRows: allRows.length,
    activeRows: allRows.length,
    positiveWeightRows: allRows.filter((r) => r.Qty_Weight_Net_Bal > 0).length,
    hardExcluded: excluded.length,
    softExcluded: review.length,
    includedRows: includedRows.length,
    includedProducts: products.length,
    includedListings: totalListings,
    includedWeightLbs: Math.round(totalIncludedWeight),
    includedQuantity: totalIncludedQty,
    hardExclusionBreakdown: hardBreakdown,
    softExclusionBreakdown: softBreakdown,
  };

  return {
    included: {
      lastUpdated: new Date().toISOString().slice(0, 10),
      products,
    },
    excluded,
    review,
    warnings,
    stats,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferPackSize(format: string, unitType: string): string {
  if (format === "Juice Concentrate") return "54 gal drums / 275 kg net";
  if (format === "Puree") return "54 gal drums";
  if (format === "IQF") return "30 lb cases";
  return "";
}

/**
 * Summarize review items grouped by customer + product for display.
 */
export function formatReviewSummary(review: ExcludedRow[]): string {
  const lines: string[] = [];
  lines.push("## Items for Review");
  lines.push("");

  // Group by reason category
  const byReason = new Map<string, ExcludedRow[]>();
  for (const r of review) {
    const cat = r.reason.split(":")[0];
    if (!byReason.has(cat)) byReason.set(cat, []);
    byReason.get(cat)!.push(r);
  }

  for (const [cat, rows] of byReason) {
    lines.push(`### ${cat === "direct-customer" ? "Direct Customer Stock" : cat === "reserved-stock" ? "Reserved Stock" : cat}`);
    lines.push("");

    // Group by customer
    const byCustomer = new Map<string, ExcelRow[]>();
    for (const r of rows) {
      const cust = r.row.Stock_Contract_Customer || "Unknown";
      if (!byCustomer.has(cust)) byCustomer.set(cust, []);
      byCustomer.get(cust)!.push(r.row);
    }

    lines.push("| Customer | Product | Qty | Weight (lbs) | Warehouse |");
    lines.push("|----------|---------|-----|-------------|-----------|");
    for (const [cust, custRows] of byCustomer) {
      // Aggregate by product
      const byProd = new Map<string, { qty: number; weight: number; wh: Set<string> }>();
      for (const r of custRows) {
        const prod = r.Stock_Description;
        if (!byProd.has(prod)) byProd.set(prod, { qty: 0, weight: 0, wh: new Set() });
        const p = byProd.get(prod)!;
        p.qty += Math.abs(Number(r.Qty_Cases) || 0);
        p.weight += Number(r.Qty_Weight_Net_Bal) || 0;
        if (r.Stock_Cold_Store) p.wh.add(r.Stock_Cold_Store);
      }
      for (const [prod, agg] of byProd) {
        lines.push(
          `| ${cust} | ${prod} | ${fmtNum(agg.qty)} | ${fmtNum(Math.round(agg.weight))} | ${[...agg.wh].join(", ")} |`
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
