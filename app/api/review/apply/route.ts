import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

interface ReviewItem {
  reason: string;
  ruleType: string;
  product: string;
  specification: string;
  warehouse: string;
  supplier: string;
  origin: string;
  contract: string;
  cases: number;
  weight: number;
  unit: string;
  reserved: string;
  bbd: string | number;
  lotNumber: string;
}

// Simple file-based lock to prevent concurrent submissions
const LOCK_FILE = join(process.cwd(), "data", ".review-lock");

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    // Check if lock is stale (older than 30 seconds)
    try {
      const stat = require("fs").statSync(LOCK_FILE);
      if (Date.now() - stat.mtimeMs < 30000) return false;
    } catch { /* stale lock, proceed */ }
  }
  try {
    writeFileSync(LOCK_FILE, String(Date.now()), { flag: "wx" });
    return true;
  } catch {
    // File already exists (race between check and create)
    return false;
  }
}

function releaseLock(): void {
  try { unlinkSync(LOCK_FILE); } catch { /* already gone */ }
}

export async function POST(request: Request) {
  // Auth check — must be authenticated reviewer
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse and validate request body
  let body: { include: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.include) || body.include.length === 0) {
    return NextResponse.json({ error: "No items selected" }, { status: 400 });
  }

  // Validate indices are non-negative integers
  const indices = new Set<number>();
  for (const val of body.include) {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Invalid index in include array" }, { status: 400 });
    }
    indices.add(n);
  }

  // Acquire lock to prevent concurrent submissions
  if (!acquireLock()) {
    return NextResponse.json({ error: "Another review submission is in progress. Try again in a moment." }, { status: 409 });
  }

  try {
    return await processReview(indices);
  } finally {
    releaseLock();
  }
}

async function processReview(indices: Set<number>) {
  const dataDir = join(process.cwd(), "data");
  const reviewPath = join(dataDir, "import-review.json");
  const proposedPath = join(dataDir, "inventory-proposed.json");

  if (!existsSync(reviewPath)) {
    return NextResponse.json({ error: "No import-review.json found" }, { status: 404 });
  }

  // If inventory-proposed.json was already synced/cleaned, seed from current inventory.json
  if (!existsSync(proposedPath)) {
    const inventoryPath = join(dataDir, "inventory.json");
    if (!existsSync(inventoryPath)) {
      return NextResponse.json({ error: "No inventory-proposed.json or inventory.json found" }, { status: 404 });
    }
    try {
      const current = readFileSync(inventoryPath, "utf-8");
      writeFileSync(proposedPath, current, "utf-8");
    } catch {
      return NextResponse.json({ error: "Failed to seed inventory-proposed.json from inventory.json" }, { status: 500 });
    }
  }

  // Load data
  let reviewItems: ReviewItem[];
  let proposed: { lastUpdated: string; products: any[] };
  try {
    reviewItems = JSON.parse(readFileSync(reviewPath, "utf-8"));
    proposed = JSON.parse(readFileSync(proposedPath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Failed to read data files" }, { status: 500 });
  }

  if (!Array.isArray(reviewItems) || !Array.isArray(proposed.products)) {
    return NextResponse.json({ error: "Corrupt data files" }, { status: 500 });
  }

  // Load reference data for supplier/warehouse resolution
  let suppliersFile: any, warehousesFile: any;
  try {
    suppliersFile = JSON.parse(readFileSync(join(dataDir, "suppliers.json"), "utf-8"));
    warehousesFile = JSON.parse(readFileSync(join(dataDir, "warehouses.json"), "utf-8"));
  } catch {
    return NextResponse.json({ error: "Failed to read reference data" }, { status: 500 });
  }

  const supplierMap = new Map<string, any>(
    (suppliersFile.suppliers || []).map((s: any) => [s.name.toLowerCase().replace(/\s+/g, " "), s])
  );
  const warehouseMap = new Map<string, any>(
    (warehousesFile.warehouses || []).map((w: any) => [w.name.toLowerCase(), w])
  );

  // Filter to valid indices within bounds
  const selectedItems = reviewItems.filter((_, i) => indices.has(i) && i < reviewItems.length);

  if (selectedItems.length === 0) {
    return NextResponse.json({ error: "No valid items at the given indices" }, { status: 400 });
  }

  // Track merge stats
  const newProductIds = new Set<string>();
  const mergedProductIds = new Set<string>();
  let addedWeight = 0;

  for (const item of selectedItems) {
    // Resolve warehouse
    const whKey = (item.warehouse || "").toLowerCase().trim();
    let warehouseName = item.warehouse || "Unknown";
    let city = "";
    let state = "";

    for (const [k, w] of warehouseMap) {
      if (whKey === k || whKey.includes(k) || k.includes(whKey)) {
        warehouseName = w.name;
        city = w.city;
        state = w.state;
        break;
      }
    }

    // Resolve supplier
    const suppKey = (item.supplier || "").toLowerCase().trim().replace(/\s+/g, " ");
    let supplierName = item.supplier || "Unknown";
    let coo = normalizeCOO(item.origin || "");

    for (const [k, s] of supplierMap) {
      const nk = k.replace(/\s+/g, " ");
      if (suppKey === nk || suppKey.includes(nk) || nk.includes(suppKey)) {
        supplierName = s.tradingCompany
          ? (s.displayName || "Various")
          : s.name;
        coo = s.countryOfOrigin || coo;
        break;
      }
    }

    // Parse product description
    const parsed = parseDescription(item.product || "", item.specification || "");
    const productId = generateProductId(
      parsed.commodity, parsed.format, parsed.specification, parsed.organic, parsed.variety
    );

    // Find or create product
    let product = proposed.products.find((p: any) => p.id === productId);

    if (!product) {
      product = {
        id: productId,
        product: parsed.displayName,
        commodity: parsed.commodity,
        category: parsed.category,
        format: parsed.format,
        processType: parsed.processType,
        specification: parsed.specification,
        variety: parsed.variety,
        grade: null,
        organic: parsed.organic,
        certifications: parsed.organic ? ["Organic"] : [],
        packSize: inferPackSize(parsed.format),
        unitType: parsed.unitType,
        listings: [],
      };
      proposed.products.push(product);
      newProductIds.add(productId);
    } else {
      mergedProductIds.add(productId);
    }

    // Find or create listing
    const listingKey = JSON.stringify({ w: warehouseName, s: supplierName });
    let listing = product.listings.find(
      (l: any) => JSON.stringify({ w: l.warehouse, s: l.supplier }) === listingKey
    );

    if (!listing) {
      listing = {
        id: product.listings.length + 1,
        warehouse: warehouseName,
        city,
        state,
        supplier: supplierName,
        countryOfOrigin: coo,
        quantity: 0,
        weightLbs: 0,
        arrived: "",
        minBBD: "",
        contracts: [],
        lots: [],
      };
      product.listings.push(listing);
    }

    // Accumulate with safe number coercion
    const itemCases = Number(item.cases) || 0;
    const itemWeight = Number(item.weight) || 0;
    listing.quantity += Math.abs(itemCases);
    listing.weightLbs += itemWeight;
    addedWeight += itemWeight;

    // Add contract
    if (item.contract && !listing.contracts.includes(String(item.contract))) {
      listing.contracts.push(String(item.contract));
    }

    // Add lot
    if (item.lotNumber) {
      if (!listing.lots) listing.lots = [];
      listing.lots.push({
        id: listing.lots.length + 1,
        lotNumber: String(item.lotNumber),
        quantity: Math.abs(itemCases),
        weightLbs: itemWeight,
        bbd: typeof item.bbd === "number" ? excelDateToISO(item.bbd) : String(item.bbd || ""),
        contracts: item.contract ? [String(item.contract)] : [],
      });
    }
  }

  // Sort products
  proposed.products.sort((a: any, b: any) =>
    a.commodity.localeCompare(b.commodity) || a.product.localeCompare(b.product)
  );

  // Write updated proposed (atomic: write to temp, then rename)
  const tmpPath = proposedPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(proposed, null, 2), "utf-8");
  renameSync(tmpPath, proposedPath);

  // Remove only the applied items from the review file; keep remaining items for further review
  const remainingItems = reviewItems.filter((_, i) => !indices.has(i));
  if (remainingItems.length === 0) {
    unlinkSync(reviewPath);
  } else {
    const tmpReview = reviewPath + ".tmp";
    writeFileSync(tmpReview, JSON.stringify(remainingItems, null, 2), "utf-8");
    renameSync(tmpReview, reviewPath);
  }

  const totalNewProducts = newProductIds.size;
  const totalMergedProducts = mergedProductIds.size;

  return NextResponse.json({
    message: `Added ${selectedItems.length} rows (${fmtNum(Math.round(addedWeight))} lbs) across ${totalNewProducts + totalMergedProducts} products. ${totalNewProducts} new, ${totalMergedProducts} updated.${remainingItems.length > 0 ? ` ${remainingItems.length} items still pending review.` : " Review file cleared."}`,
    addedItems: selectedItems.length,
    addedWeight: Math.round(addedWeight),
    newProducts: totalNewProducts,
    remainingItems: remainingItems.length,
  });
}

// ─── Inline helpers ───────────────────────────────────────────────

function normalizeCOO(raw: string): string {
  if (!raw) return "";
  const upper = raw.toUpperCase().trim();
  const map: Record<string, string> = {
    "THE PEOPLES REPUBLIC OF CHINA": "China",
    CHINA: "China", TURKEY: "Turkey", CHILE: "Chile",
    SERBIA: "Serbia", PERU: "Peru", ECUADOR: "Ecuador",
    ITALY: "Italy", ARGENTINA: "Argentina", "SOUTH AFRICA": "South Africa",
    THAILAND: "Thailand", BRAZIL: "Brazil", MEXICO: "Mexico",
    EGYPT: "Egypt", GREECE: "Greece", MOROCCO: "Morocco",
    GUATEMALA: "Guatemala", "COSTA RICA": "Costa Rica",
    "U.S.A.": "USA", CANADA: "Canada", SPAIN: "Spain",
  };
  return map[upper] || titleCase(raw);
}

function titleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function generateProductId(commodity: string, format: string, spec: string | null, organic: boolean, variety: string | null): string {
  const parts: string[] = [slugify(commodity)];
  if (format === "Juice Concentrate") parts.push("jc");
  else if (format === "IQF") parts.push("iqf");
  else if (format === "Puree") parts.push("puree");
  else parts.push(slugify(format));
  if (spec) parts.push(slugify(spec));
  if (variety) parts.push(slugify(variety));
  if (organic) parts.push("organic");
  return parts.join("-");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferPackSize(format: string): string {
  if (format === "Juice Concentrate") return "54 gal drums / 275 kg net";
  if (format === "Puree") return "54 gal drums";
  if (format === "IQF") return "30 lb cases";
  return "";
}

function excelDateToISO(val: number | string): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" && val > 30000) {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  return String(val);
}

const VEGETABLES = new Set(["spinach", "beans", "brussels sprouts", "broccoli", "okra", "peas", "corn"]);
const FORMAT_MAP: Record<string, string> = {
  jc: "Juice Concentrate", "juice conc.": "Juice Concentrate", "juice conc": "Juice Concentrate",
  "juice concentrate": "Juice Concentrate", iqf: "IQF", puree: "Puree",
};

function parseDescription(desc: string, specField: string): {
  displayName: string; commodity: string; category: string; format: string;
  processType: string; specification: string | null; variety: string | null;
  organic: boolean; unitType: string;
} {
  if (!desc) {
    return { displayName: "Unknown", commodity: "Unknown", category: "Fruit", format: "Other",
      processType: "Other", specification: null, variety: null, organic: false, unitType: "cases" };
  }

  const hasCommas = desc.includes(",");
  let commodity = "";
  let format = "";
  let organic = false;
  const specParts: string[] = [];

  if ((specField || "").toLowerCase().match(/organic|nop/)) organic = true;

  if (hasCommas) {
    const parts = desc.split(",").map(s => s.trim()).filter(Boolean);
    commodity = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const low = parts[i].toLowerCase().replace(/[.,]/g, "");
      const words = low.split(/\s+/);
      if (!format && FORMAT_MAP[words[0]] && words.length > 1) {
        format = FORMAT_MAP[words[0]];
        specParts.push(words.slice(1).map(w => titleCase(w)).join(" "));
      } else if (FORMAT_MAP[low]) {
        format = FORMAT_MAP[low];
      } else if (low === "nop" || low === "org" || low === "organic") {
        organic = true;
      } else if (low.startsWith("grade")) {
        continue;
      } else if (low !== "conventional" && low !== "conv" && low !== "frozen" && low !== "aseptic") {
        specParts.push(parts[i]);
      }
    }
  } else {
    const descLow = desc.toLowerCase();
    if (descLow.includes("juice conc")) {
      format = "Juice Concentrate";
      commodity = desc.substring(0, descLow.indexOf("juice conc")).trim();
      const after = desc.substring(descLow.indexOf("juice conc")).replace(/juice concentrate|juice conc\.?/i, "").trim();
      if (after) specParts.push(after);
    } else if (descLow.includes("iqf")) {
      format = "IQF";
      commodity = desc.substring(0, descLow.indexOf("iqf")).trim();
    } else if (descLow.includes("puree")) {
      format = "Puree";
      commodity = desc.substring(0, descLow.indexOf("puree")).trim();
    } else {
      commodity = desc;
      format = "Other";
    }
  }

  commodity = commodity.replace(/,\s*$/, "").trim();
  const specification = specParts.length > 0
    ? specParts.join(", ").replace(/[,.\s]+$/, "")
      .replace(/\b(\d+)\s*Bx\b/i, "$1 Brix")
      .replace(/\b(\d+)Bx\b/i, "$1 Brix")
      .replace(/\b(\d+)\s*brix\b/i, "$1 Brix")
      .replace(/\b(\d+)\s*GPL\b/i, "$1 GPL")
    : null;

  const category = VEGETABLES.has(commodity.toLowerCase()) ? "Vegetable" : "Fruit";
  const processType = format === "Juice Concentrate" ? "Aseptic" : format === "IQF" ? "Frozen" : format === "Puree" ? "Frozen" : "Other";
  const unitType = format === "Juice Concentrate" || format === "Puree" ? "drums" : "cases";
  const displayName = `${commodity} ${format}`.trim();

  return { displayName, commodity, category, format, processType, specification, variety: null, organic, unitType };
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
