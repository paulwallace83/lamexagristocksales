import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from "fs";
import { basename, join, resolve } from "path";
import {
  getProductSummaries,
  findLotsByNumber,
  findLotsByNumbers,
  findByContractNumber,
  searchProducts,
  getSyncInfo,
  getTestResultCoverage,
  getCoaBackfillStatus,
  getCoaBackfillDocuments,
} from "./agent-db";
import { getProductById } from "./inventory-db";
import { getDb } from "./db";
import { getDocumentStatus, addDocument, getUploadDir, getDocumentUrl, generateDocFilename } from "./documents";
import { getDiscountItems, addDiscountItemsFromLots, restoreToInventory } from "./discount";
import { clearFlags, getNewArrivalsWithNames } from "./product-flags";
import { computeDiff, formatDiffReport, reconciliationReport } from "./sync";
import { applySync } from "./sync-apply";
import { importFromBuffer, formatReviewSummary } from "./excel-import";
import { getUploadsRoot } from "./paths";
import type { DocCategory } from "./documents";
import type { DiscountReason, DiscountStatus } from "./discount";

/* ------------------------------------------------------------------ */
/*  File data type (held in memory during a request)                  */
/* ------------------------------------------------------------------ */

export interface FileData {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Tool definitions                                                  */
/* ------------------------------------------------------------------ */

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_products",
    description:
      "Get a lightweight list of all products currently in regular inventory with quantity/weight totals and warehouse locations, plus any active Discount & Clearance items. Use this for a broad overview before doing more specific lookups.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_product_details",
    description:
      "Get full details for a specific product: all listings, lots, contract references, BBD dates, and supplier info.",
    input_schema: {
      type: "object" as const,
      properties: {
        productId: { type: "string", description: "Product ID (e.g. 'apple-jc-organic')" },
      },
      required: ["productId"],
    },
  },
  {
    name: "search_inventory",
    description:
      "Search products by name, commodity, or specification. Returns up to 20 matching products.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search text" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_lot_by_number",
    description:
      "Find which product and listing a lot number belongs to. Supports partial matching. Use this to match lot numbers found in COA documents to inventory records.",
    input_schema: {
      type: "object" as const,
      properties: {
        lotNumber: { type: "string", description: "Lot number to search for (partial match supported)" },
      },
      required: ["lotNumber"],
    },
  },
  {
    name: "batch_lot_lookup",
    description:
      "Look up multiple lot numbers in a single call. Use this instead of calling get_lot_by_number repeatedly when processing multiple files. Returns matches grouped by each input lot number.",
    input_schema: {
      type: "object" as const,
      properties: {
        lotNumbers: {
          type: "array",
          items: { type: "string" },
          description: "Array of lot numbers to search for (partial match supported for each)",
        },
      },
      required: ["lotNumbers"],
    },
  },
  {
    name: "get_contract_info",
    description:
      "Find which product and lots are associated with a contract or container reference number (e.g. '124717' or '124717-04').",
    input_schema: {
      type: "object" as const,
      properties: {
        contractNumber: {
          type: "string",
          description: "Contract or container reference number",
        },
      },
      required: ["contractNumber"],
    },
  },
  {
    name: "get_document_status",
    description:
      "Check document coverage (COAs, test results, spec sheets, labels, photos) for all products or a specific product. Shows how many lots have COAs and test results, flags lots expected to have test results (heavy metals for Juice Concentrate, pesticide for Organic), and how many contracts have required documents.",
    input_schema: {
      type: "object" as const,
      properties: {
        productId: {
          type: "string",
          description: "Optional: specific product ID. Omit to return status for all products.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_discount_items",
    description: "Get Discount & Clearance inventory items.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["active", "sold", "missing", "all"],
          description: "Filter by status. Defaults to 'active'.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_import_review",
    description:
      "Get items currently pending in the import review queue — soft-excluded items from the last Excel import that need manual approval before sync.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_sync_info",
    description: "Get the timestamp of the last inventory sync.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "upload_document",
    description:
      "Upload a document (COA, test results, spec sheet, label photo, or product photo) to the correct product, lot, or contract. ALWAYS confirm the match and intent with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        productId: { type: "string", description: "Product ID to attach the document to" },
        category: {
          type: "string",
          enum: ["coa", "test-results", "specs", "labels", "photos"],
          description: "Document category",
        },
        fileRef: {
          type: "string",
          description: "Sanitised filename of the uploaded file (as listed in the file attachments)",
        },
        originalName: { type: "string", description: "Original filename for display" },
        lotIds: {
          type: "array",
          items: { type: "number" },
          description: "Required for coa and test-results: the database lot IDs to associate this document with",
        },
        baseContract: {
          type: "string",
          description: "Required for specs, labels, and photos: the base contract number (e.g. '124717')",
        },
        documentDate: {
          type: "string",
          description: "Production date or document date in YYYY-MM-DD format. Extract from the document if available (e.g. production date on a COA). Defaults to today if not provided.",
        },
      },
      required: ["productId", "category", "fileRef", "originalName"],
    },
  },
  {
    name: "batch_upload_documents",
    description:
      "Upload multiple documents in a single call. Each item specifies a file, its target product/lot/contract, and category. Use this instead of calling upload_document repeatedly when processing multiple files. ALWAYS confirm ALL matches with the user in a single consolidated table before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        uploads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Product ID to attach the document to" },
              category: {
                type: "string",
                enum: ["coa", "test-results", "specs", "labels", "photos"],
                description: "Document category",
              },
              fileRef: {
                type: "string",
                description: "Sanitised filename of the uploaded file",
              },
              originalName: { type: "string", description: "Original filename for display" },
              lotIds: {
                type: "array",
                items: { type: "number" },
                description: "Required for coa and test-results: database lot IDs",
              },
              baseContract: {
                type: "string",
                description: "Required for specs, labels, and photos: base contract number",
              },
              documentDate: {
                type: "string",
                description: "Production date or document date in YYYY-MM-DD format. Extract from the document if available.",
              },
            },
            required: ["productId", "category", "fileRef", "originalName"],
          },
          description: "Array of upload specifications, one per file",
        },
      },
      required: ["uploads"],
    },
  },
  {
    name: "create_discount_item",
    description:
      "Move a specific lot from regular inventory to Discount & Clearance. The lot is immediately deducted from regular inventory. ALWAYS confirm the lot, product, reason, and price with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        productId: { type: "string", description: "Product ID" },
        lotNumber: { type: "string", description: "Exact lot number to move to discount" },
        reason: {
          type: "string",
          enum: ["insurance-claim", "expired", "overstock", "damaged", "other"],
          description: "Reason for discounting",
        },
        notes: { type: "string", description: "Optional notes about the item" },
        askingPrice: {
          type: "string",
          description: "Optional asking price (e.g. '$0.30/lb', 'Make Offer')",
        },
      },
      required: ["productId", "lotNumber", "reason"],
    },
  },
  {
    name: "restore_discount_item",
    description:
      "Permanently delete a discount item and immediately restore its lot back to regular inventory. ALWAYS confirm the item ID and intent with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        discountId: {
          type: "string",
          description: "Discount item ID (e.g. 'disc-001')",
        },
      },
      required: ["discountId"],
    },
  },
  {
    name: "get_coa_backfill_status",
    description:
      "Check which COA documents have been uploaded but are missing extracted key aspects (brix, acidity, color, etc.). Returns a summary grouped by product showing documents and lots that need backfill. Call this BEFORE backfill_coa_data to show the user the scope.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "backfill_coa_data",
    description:
      "Re-extract COA key aspects from already-uploaded COA files on disk using Claude vision. Reads each COA file, sends it for extraction, and saves the results. ALWAYS call get_coa_backfill_status first to show the scope, then confirm with the user before calling this tool. Processes up to 50 documents per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        lotNumbers: {
          type: "array",
          items: { type: "string" },
          description: "Optional: specific lot numbers to backfill. Omit to process all lots missing COA data (up to 50 documents).",
        },
      },
      required: [],
    },
  },
  {
    name: "save_coa_data",
    description:
      "Save or update extracted COA key aspects (brix, acidity, color, clarity, ratio, defects, overripe, underripe, NTU, etc.) for a specific lot. COA data is auto-extracted on upload, but use this tool to correct values, add missing data, or manually enter data after reviewing a COA. Only include fields you can clearly verify.",
    input_schema: {
      type: "object" as const,
      properties: {
        lotNumber: { type: "string", description: "Lot number to save data for" },
        productId: { type: "string", description: "Product ID the lot belongs to" },
        fields: {
          type: "object",
          description: "Key-value pairs of COA parameters. Keys should be lowercase snake_case (e.g. brix, acidity, color, ntu). Values must be a single number or short string — never a range.",
          additionalProperties: { oneOf: [{ type: "number" }, { type: "string" }] },
        },
      },
      required: ["lotNumber", "productId", "fields"],
    },
  },
  {
    name: "get_new_arrivals",
    description:
      "Get the list of products currently flagged as new arrivals. These flags are set automatically during each weekly sync for products that appear for the first time.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "clear_new_arrivals",
    description:
      "Clear all new-arrival flags. Use this when the user decides not to send a marketing email for the current new arrivals. ALWAYS confirm with the user before calling this tool.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_reference_data",
    description:
      "Get the full supplier and warehouse reference data used during weekly sync. Returns suppliers (with COO, trading company flags) and warehouses (with city/state). Use this to resolve supplier countries of origin and warehouse locations when parsing pasted pivot table data.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "save_proposed_inventory",
    description:
      "Write a parsed inventory to data/inventory-proposed.json. This is the agent's equivalent of writing the proposed file during the weekly sync workflow. The products array should contain fully structured product objects. ALWAYS confirm with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        products: {
          type: "array",
          items: { type: "object" },
          description: "Array of product objects to write as proposed inventory",
        },
      },
      required: ["products"],
    },
  },
  {
    name: "run_sync_diff",
    description:
      "Run the sync diff engine to compare data/inventory-proposed.json against the current data/inventory.json. Returns a formatted markdown diff report, raw warnings array, and summary statistics. Both files must exist before calling this tool.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_reconciliation",
    description:
      "Generate a per-product quantity and weight reconciliation table from the current inventory.json. Use this after apply_sync to present the cross-check table for the user to verify against the raw ERP data. Sync is not complete until reconciliation is signed off.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "apply_sync",
    description:
      "Apply the approved sync: snapshot current inventory, overwrite with proposed data, re-seed the database, re-link documents and COA data, and deduct discount lots. This is the most consequential action in the system — it replaces the entire inventory. ALWAYS show the diff report first, summarise what will happen, and wait for explicit user approval before calling this tool.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "dry_run_sync",
    description:
      "Run a dry-run sync to validate that the proposed inventory would sync successfully without modifying any data. Returns the counts that would result from a real sync (products, listings, contracts, lots, warehouses, suppliers). No snapshot is created, no files are written, and the database is untouched. Use this to give the user confidence before calling apply_sync.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "import_inventory_file",
    description:
      "Import an uploaded Excel (.xlsx/.xls) or CSV file from the ERP system. Parses the spreadsheet, applies hard/soft exclusion rules, normalizes warehouses and suppliers using reference data, and writes data/inventory-proposed.json (plus data/import-review.json if soft-excluded items exist). Returns import stats, warnings, and a review summary. Use this instead of manual pivot table parsing when the user uploads a file. ALWAYS confirm with the user before calling this tool.",
    input_schema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file to import (must be in the current file attachments)",
        },
      },
      required: ["fileName"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const VALID_CATEGORIES: DocCategory[] = ["coa", "test-results", "specs", "labels", "photos"];
const LOT_CATEGORIES: DocCategory[] = ["coa", "test-results"];
const CONTRACT_CATEGORIES: DocCategory[] = ["specs", "labels", "photos"];
const VALID_REASONS: DiscountReason[] = [
  "insurance-claim",
  "expired",
  "overstock",
  "damaged",
  "other",
];

/* ------------------------------------------------------------------ */
/*  Single-upload helper (shared by upload_document & batch)          */
/* ------------------------------------------------------------------ */

// Monotonic counter to prevent docId/filename collisions within a batch
let uploadCounter = 0;

type UploadSuccess = {
  success: true;
  documentId: string;
  filename: string;
  url: string;
  category: string;
  lotIds: number[];
  fileBuffer: Buffer;
  fileMimeType: string;
};
type UploadFailure = { success: false; error: string };
type UploadResult = UploadSuccess | UploadFailure;

function executeOneUpload(
  input: { productId: string; category: string; fileRef: string; originalName: string; lotIds?: number[]; baseContract?: string; documentDate?: string },
  fileMap: Map<string, FileData>,
  uploaderEmail: string,
): UploadResult {
  const { productId, fileRef, originalName } = input;
  const category = input.category as DocCategory;
  const lotIds = input.lotIds ?? [];
  const baseContract = input.baseContract;
  const documentDate = input.documentDate;

  if (!productId) return { success: false, error: "productId is required" };
  const productExists = getProductById(productId);
  if (!productExists) return { success: false, error: `Product '${productId}' not found` };

  if (!VALID_CATEGORIES.includes(category)) {
    return { success: false, error: `Invalid category '${category}'` };
  }
  if (LOT_CATEGORIES.includes(category) && lotIds.length === 0) {
    return { success: false, error: "lotIds are required for coa and test-results" };
  }
  if (CONTRACT_CATEGORIES.includes(category) && !baseContract) {
    return { success: false, error: "baseContract is required for specs, labels, and photos" };
  }

  // Resolve file from fileMap with fuzzy matching
  let fileData = fileMap.get(fileRef);
  if (!fileData) {
    const refLower = fileRef.toLowerCase();
    for (const [key, data] of fileMap) {
      if (
        key.toLowerCase().includes(refLower) ||
        refLower.includes(key.toLowerCase()) ||
        (() => {
          const refDigits = refLower.match(/\d{5,}/g);
          const keyDigits = key.toLowerCase().match(/\d{5,}/g);
          return refDigits && keyDigits && refDigits.some((d) => keyDigits.includes(d));
        })()
      ) {
        fileData = data;
        break;
      }
    }
  }
  if (!fileData) {
    const available = Array.from(fileMap.keys()).join(", ");
    return {
      success: false,
      error: `File '${fileRef}' not found. Available files: ${available || "none — please re-upload"}.`,
    };
  }

  const safePid = productId.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Resolve lot number for stable storage path (lot IDs change on re-seed)
  let lotNumber: string | undefined;
  if (LOT_CATEGORIES.includes(category) && lotIds.length > 0) {
    const lotRow = getDb().prepare("SELECT lot_number FROM lots WHERE id = ?").get(lotIds[0]) as { lot_number: string } | undefined;
    if (!lotRow) return { success: false, error: `Lot ID ${lotIds[0]} not found in database` };
    lotNumber = lotRow.lot_number;
  }

  // Look up COO for contract-level docs
  let countryOfOrigin: string | undefined;
  if (CONTRACT_CATEGORIES.includes(category)) {
    const cooRow = getDb().prepare("SELECT country_of_origin FROM listings WHERE product_id = ? LIMIT 1").get(productId) as { country_of_origin: string } | undefined;
    countryOfOrigin = cooRow?.country_of_origin;
  }

  const storageOpts = LOT_CATEGORIES.includes(category)
    ? { lotNumber: lotNumber! }
    : { baseContract: baseContract!.replace(/[^a-zA-Z0-9._-]/g, "_") };

  let dir: string;
  try {
    dir = getUploadDir(safePid, category, storageOpts);
  } catch {
    return { success: false, error: "Invalid upload path" };
  }

  const filename = generateDocFilename({
    category,
    productName: productExists.product,
    originalName,
    documentDate,
    lotNumber,
    baseContract: CONTRACT_CATEGORIES.includes(category) ? baseContract! : undefined,
    countryOfOrigin,
    targetDir: dir,
  });

  const filepath = join(dir, filename);
  const uploadsRoot = resolve(getUploadsRoot());
  if (!resolve(filepath).startsWith(uploadsRoot + "/")) {
    return { success: false, error: "Invalid upload path" };
  }

  mkdirSync(dir, { recursive: true }); // ensure directory exists (belt-and-suspenders)
  writeFileSync(filepath, fileData.buffer);

  const docId = `${productId}-${category}-${Date.now()}-${uploadCounter++}`;
  try {
    addDocument({
      id: docId,
      productId,
      category,
      filename,
      originalName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploaderEmail,
      baseContract: CONTRACT_CATEGORIES.includes(category) ? (baseContract ?? null) : null,
      lotIds: LOT_CATEGORIES.includes(category) ? lotIds : undefined,
    });
  } catch (err) {
    try { unlinkSync(filepath); } catch { /* best-effort cleanup */ }
    return { success: false, error: err instanceof Error ? err.message : "Database error saving document" };
  }

  const url = getDocumentUrl(productId, category, filename, storageOpts);
  return {
    success: true,
    documentId: docId,
    filename,
    url,
    category,
    lotIds,
    fileBuffer: Buffer.from(fileData.buffer),
    fileMimeType: fileData.mimeType,
  };
}

/**
 * Fire-and-forget COA auto-extraction via Claude Haiku vision.
 * Mirrors the pattern in /api/upload/route.ts.
 */
function triggerCoaExtraction(result: UploadSuccess): void {
  if (result.category !== "coa" || result.lotIds.length === 0) return;

  // fileBuffer is already a clone (Buffer.from in executeOneUpload), safe for async use
  const extractBuffer = result.fileBuffer;
  const extractLotIds = [...result.lotIds];

  import("./coa-extract").then(({ extractCoaData }) => {
    extractCoaData(extractBuffer, result.fileMimeType).then((fields) => {
      if (fields) {
        import("./coa-data").then(({ upsertCoaData }) => {
          for (const lid of extractLotIds) {
            try {
              upsertCoaData(lid, fields, "auto-extract");
            } catch (err) {
              console.warn(`[agent] COA data upsert failed for lot ${lid}:`, err);
            }
          }
        });
      }
    }).catch((err) => {
      console.warn("[agent] COA extraction failed:", err);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Tool execution                                                    */
/* ------------------------------------------------------------------ */

// Tools that require the "reviewer" role (sync-action tools)
const REVIEWER_ONLY_TOOLS = new Set(["save_proposed_inventory", "apply_sync", "import_inventory_file"]);

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  fileMap: Map<string, FileData>,
  uploaderEmail: string,
  userRole?: string,
): Promise<unknown> {
  if (REVIEWER_ONLY_TOOLS.has(toolName) && userRole !== "reviewer") {
    return { error: "This tool requires the reviewer role" };
  }
  switch (toolName) {
    /* ── Read-only tools ─────────────────────────────────────────── */

    case "list_products": {
      const products = getProductSummaries();
      const discountItems = getDiscountItems("active");
      return { products, discountItems };
    }

    case "get_product_details": {
      const id = String(input.productId ?? "");
      const product = getProductById(id);
      if (!product) return { error: `Product '${id}' not found` };
      return product;
    }

    case "search_inventory": {
      const query = String(input.query ?? "");
      if (!query) return { error: "query is required" };
      return searchProducts(query);
    }

    case "get_lot_by_number": {
      const lotNumber = String(input.lotNumber ?? "");
      if (!lotNumber) return { error: "lotNumber is required" };
      const matches = findLotsByNumber(lotNumber);
      if (matches.length === 0) return { found: false, message: `No lots found matching '${lotNumber}'` };
      return { found: true, matches };
    }

    case "get_contract_info": {
      const contractNumber = String(input.contractNumber ?? "");
      if (!contractNumber) return { error: "contractNumber is required" };
      const matches = findByContractNumber(contractNumber);
      if (matches.length === 0)
        return { found: false, message: `No products found for contract '${contractNumber}'` };
      return { found: true, matches };
    }

    case "get_document_status": {
      const productId = input.productId ? String(input.productId) : undefined;
      const allStatuses = getDocumentStatus();
      const testCoverage = getTestResultCoverage();
      const testMap = new Map(testCoverage.map((t) => [t.productId, t]));

      // Enrich with missingTestLots (specific lot IDs the agent needs for matching)
      const enriched = allStatuses.map((s) => ({
        ...s,
        missingTestLots: testMap.get(s.productId)?.missingTestLots ?? [],
      }));

      if (productId) {
        const found = enriched.find((s) => s.productId === productId);
        if (!found) return { error: `Product '${productId}' not found` };
        return found;
      }
      return enriched;
    }

    case "get_discount_items": {
      const status = (input.status as DiscountStatus | "all" | undefined) ?? "active";
      return getDiscountItems(status);
    }

    case "get_import_review": {
      const reviewPath = join(process.cwd(), "data", "import-review.json");
      if (!existsSync(reviewPath)) {
        return { available: false, message: "No import review queue — run npm run import-excel first" };
      }
      try {
        const items = JSON.parse(readFileSync(reviewPath, "utf-8"));
        return { available: true, count: Array.isArray(items) ? items.length : 0, items };
      } catch {
        return { error: "Could not read import-review.json" };
      }
    }

    case "get_sync_info":
      return getSyncInfo();

    case "get_coa_backfill_status":
      return getCoaBackfillStatus();

    case "get_reference_data": {
      const dataDir = join(process.cwd(), "data");
      try {
        const suppliers = JSON.parse(readFileSync(join(dataDir, "suppliers.json"), "utf-8"));
        if (!suppliers || typeof suppliers !== "object") {
          return { error: "suppliers.json has unexpected format" };
        }
        const warehouses = JSON.parse(readFileSync(join(dataDir, "warehouses.json"), "utf-8"));
        if (!warehouses || typeof warehouses !== "object") {
          return { error: "warehouses.json has unexpected format" };
        }
        return { suppliers: suppliers.suppliers || [], warehouses: warehouses.warehouses || [] };
      } catch (err) {
        console.error("[agent] get_reference_data error:", err);
        return { error: "Failed to read reference data" };
      }
    }

    case "run_sync_diff": {
      const dataDir = join(process.cwd(), "data");
      const inventoryPath = join(dataDir, "inventory.json");
      const proposedPath = join(dataDir, "inventory-proposed.json");
      const suppliersPath = join(dataDir, "suppliers.json");
      const warehousesPath = join(dataDir, "warehouses.json");

      if (!existsSync(proposedPath)) {
        return { error: "No inventory-proposed.json found. Save a proposed inventory first using save_proposed_inventory." };
      }
      if (!existsSync(inventoryPath)) {
        return { error: "No inventory.json found. Cannot compute diff without current inventory." };
      }
      if (!existsSync(suppliersPath)) {
        return { error: "No suppliers.json found. Reference data is missing." };
      }
      if (!existsSync(warehousesPath)) {
        return { error: "No warehouses.json found. Reference data is missing." };
      }

      try {
        const diff = computeDiff(inventoryPath, proposedPath, suppliersPath, warehousesPath);
        const report = formatDiffReport(diff);
        return { report, warnings: diff.warnings, summary: diff.summary };
      } catch (err) {
        console.error("[agent] run_sync_diff error:", err);
        return { error: "Diff computation failed" };
      }
    }

    case "get_reconciliation": {
      const inventoryPath = join(process.cwd(), "data", "inventory.json");
      if (!existsSync(inventoryPath)) {
        return { error: "No inventory.json found. Run a sync first." };
      }
      try {
        const report = reconciliationReport(inventoryPath);
        return { report };
      } catch (err) {
        console.error("[agent] get_reconciliation error:", err);
        return { error: "Failed to generate reconciliation report" };
      }
    }

    case "get_new_arrivals": {
      const arrivals = getNewArrivalsWithNames();
      return { arrivals, count: arrivals.length };
    }

    /* ── Batch read-only tools ──────────────────────────────────── */

    case "batch_lot_lookup": {
      const lotNumbers = Array.isArray(input.lotNumbers)
        ? (input.lotNumbers as string[]).filter((s) => typeof s === "string" && s.trim())
        : [];
      if (lotNumbers.length === 0) return { error: "lotNumbers array is required and must not be empty" };
      if (lotNumbers.length > 50) return { error: "Maximum 50 lot numbers per batch" };

      const resultMap = findLotsByNumbers(lotNumbers);
      const results: Record<string, unknown> = {};
      for (const lotNum of lotNumbers) {
        const matches = resultMap.get(lotNum.trim()) ?? [];
        results[lotNum] = matches.length > 0
          ? { found: true, matches }
          : { found: false, message: `No lots found matching '${lotNum}'` };
      }
      return { results };
    }

    /* ── Action tools ────────────────────────────────────────────── */

    case "upload_document": {
      const result = executeOneUpload(
        {
          productId: String(input.productId ?? ""),
          category: String(input.category ?? ""),
          fileRef: String(input.fileRef ?? ""),
          originalName: String(input.originalName ?? ""),
          lotIds: Array.isArray(input.lotIds)
            ? (input.lotIds as unknown[]).filter((id): id is number => typeof id === "number" && Number.isInteger(id))
            : [],
          baseContract: input.baseContract ? String(input.baseContract) : undefined,
          documentDate: input.documentDate ? String(input.documentDate) : undefined,
        },
        fileMap,
        uploaderEmail,
      );
      if (result.success) triggerCoaExtraction(result);
      return result.success
        ? { success: true, documentId: result.documentId, filename: result.filename, url: result.url }
        : { error: result.error };
    }

    case "batch_upload_documents": {
      const uploads = Array.isArray(input.uploads) ? (input.uploads as Record<string, unknown>[]) : [];
      if (uploads.length === 0) return { error: "uploads array is required and must not be empty" };
      if (uploads.length > 30) return { error: "Maximum 30 uploads per batch" };

      const results: Array<{ fileRef: string; success: boolean; documentId?: string; filename?: string; url?: string; error?: string }> = [];
      let succeeded = 0;
      let failed = 0;

      for (const spec of uploads) {
        const fileRef = String(spec.fileRef ?? "");
        try {
          const result = executeOneUpload(
            {
              productId: String(spec.productId ?? ""),
              category: String(spec.category ?? ""),
              fileRef,
              originalName: String(spec.originalName ?? ""),
              lotIds: Array.isArray(spec.lotIds)
                ? (spec.lotIds as unknown[]).filter((id): id is number => typeof id === "number" && Number.isInteger(id))
                : [],
              baseContract: spec.baseContract ? String(spec.baseContract) : undefined,
              documentDate: spec.documentDate ? String(spec.documentDate) : undefined,
            },
            fileMap,
            uploaderEmail,
          );
          if (result.success) {
            triggerCoaExtraction(result);
            results.push({ fileRef, success: true, documentId: result.documentId, filename: result.filename, url: result.url });
            succeeded++;
          } else {
            results.push({ fileRef, success: false, error: result.error });
            failed++;
          }
        } catch (err) {
          results.push({ fileRef, success: false, error: err instanceof Error ? err.message : "Unknown error" });
          failed++;
        }
      }

      return { results, summary: { total: uploads.length, succeeded, failed } };
    }

    case "backfill_coa_data": {
      const lotNumbers = Array.isArray(input.lotNumbers)
        ? (input.lotNumbers as string[])
            .filter((s) => typeof s === "string" && s.trim())
            .slice(0, 100)
            .map((s) => s.slice(0, 100))
        : undefined;

      const docs = getCoaBackfillDocuments(lotNumbers);
      if (docs.length === 0) {
        return { message: "Nothing to backfill — all COA documents already have extracted data." };
      }

      const { extractCoaData } = await import("./coa-extract");
      const { upsertCoaData } = await import("./coa-data");
      const uploadsRoot = resolve(getUploadsRoot());

      const MIME_MAP: Record<string, string> = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };

      const safeSeg = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

      const results: Array<{
        documentId: string;
        filename: string;
        productId: string;
        success: boolean;
        lotsUpdated?: number;
        fields?: string[];
        error?: string;
      }> = [];
      let succeeded = 0;
      let failed = 0;
      let totalLotsUpdated = 0;

      for (const doc of docs) {
        const filePath = join(
          uploadsRoot,
          safeSeg(doc.productId),
          "lots",
          safeSeg(doc.lotNumber),
          "coa",
          safeSeg(doc.filename),
        );

        // Path traversal guard — same pattern as executeOneUpload
        if (!resolve(filePath).startsWith(uploadsRoot + "/")) {
          results.push({ documentId: doc.documentId, filename: doc.filename, productId: doc.productId, success: false, error: "Invalid file path" });
          failed++;
          continue;
        }

        if (!existsSync(filePath)) {
          results.push({ documentId: doc.documentId, filename: doc.filename, productId: doc.productId, success: false, error: "File not found on disk" });
          failed++;
          continue;
        }

        try {
          const buffer = readFileSync(filePath);
          const dotIdx = doc.filename.lastIndexOf(".");
          const ext = dotIdx >= 0 ? doc.filename.substring(dotIdx).toLowerCase() : "";
          const mimeType = MIME_MAP[ext] ?? "application/pdf";

          const fields = await extractCoaData(buffer, mimeType);
          if (!fields) {
            results.push({ documentId: doc.documentId, filename: doc.filename, productId: doc.productId, success: false, error: "Extraction returned no data" });
            failed++;
            continue;
          }

          // Upsert to all linked lots
          for (const lot of doc.lots) {
            upsertCoaData(lot.lotId, fields, "backfill");
          }

          results.push({
            documentId: doc.documentId,
            filename: doc.filename,
            productId: doc.productId,
            success: true,
            lotsUpdated: doc.lots.length,
            fields: Object.keys(fields),
          });
          succeeded++;
          totalLotsUpdated += doc.lots.length;
        } catch (err) {
          console.error(`[backfill] Extraction failed for doc ${doc.documentId}:`, err);
          results.push({
            documentId: doc.documentId,
            filename: doc.filename,
            productId: doc.productId,
            success: false,
            error: "Extraction failed",
          });
          failed++;
        }
      }

      return {
        results,
        summary: {
          documentsProcessed: docs.length,
          succeeded,
          failed,
          totalLotsUpdated,
        },
      };
    }

    case "save_proposed_inventory": {
      const products = input.products;
      if (!Array.isArray(products)) {
        return { error: "products must be an array" };
      }
      if (products.length === 0) {
        return { error: "products array must not be empty" };
      }

      const dataDir = join(process.cwd(), "data");
      const proposedPath = join(dataDir, "inventory-proposed.json");
      const data = { products, lastUpdated: new Date().toISOString().slice(0, 10) };

      try {
        writeFileSync(proposedPath, JSON.stringify(data, null, 2));
        return { success: true, productCount: products.length, path: "data/inventory-proposed.json" };
      } catch (err) {
        console.error("[agent] save_proposed_inventory error:", err);
        return { error: "Failed to write inventory-proposed.json" };
      }
    }

    case "apply_sync": {
      const dataDir = join(process.cwd(), "data");
      const proposedPath = join(dataDir, "inventory-proposed.json");
      const inventoryPath = join(dataDir, "inventory.json");
      const suppliersPath = join(dataDir, "suppliers.json");
      const warehousesPath = join(dataDir, "warehouses.json");

      if (!existsSync(proposedPath)) {
        return { error: "No inventory-proposed.json found. Save a proposed inventory first using save_proposed_inventory." };
      }
      if (!existsSync(inventoryPath)) {
        return { error: "No inventory.json found. Cannot sync without current inventory." };
      }
      if (!existsSync(suppliersPath)) {
        return { error: "No suppliers.json found. Reference data is missing." };
      }
      if (!existsSync(warehousesPath)) {
        return { error: "No warehouses.json found. Reference data is missing." };
      }

      try {
        const result = applySync({
          proposedPath,
          inventoryPath,
          dataDir,
        });
        // Sanitise snapshotPath to relative — never expose absolute filesystem paths
        const relativeSnapshot = "data/snapshots/" + basename(result.snapshotPath);
        return {
          success: true,
          result: {
            snapshotPath: relativeSnapshot,
            productCount: result.productCount,
            listingCount: result.listingCount,
            contractCount: result.contractCount,
            lotCount: result.lotCount,
            warehouseCount: result.warehouseCount,
            supplierCount: result.supplierCount,
            documentsPreserved: result.documentsPreserved,
            orphanedDocs: result.orphanedDocs,
            relinkReport: result.relinkReport,
            coaRelinkReport: result.coaRelinkReport,
            deductionReport: result.deductionReport,
            validationReport: result.validationReport,
            newArrivals: result.newArrivals,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "Sync already in progress") {
          return { error: "Sync already in progress" };
        }
        console.error("[agent] apply_sync error:", err);
        return { error: "Sync failed" };
      }
    }

    case "dry_run_sync": {
      const dataDir = join(process.cwd(), "data");
      const proposedPath = join(dataDir, "inventory-proposed.json");
      const inventoryPath = join(dataDir, "inventory.json");
      const suppliersPath = join(dataDir, "suppliers.json");
      const warehousesPath = join(dataDir, "warehouses.json");

      if (!existsSync(proposedPath)) {
        return { error: "No inventory-proposed.json found. Save a proposed inventory first using save_proposed_inventory." };
      }
      if (!existsSync(inventoryPath)) {
        return { error: "No inventory.json found. Cannot run dry-run without current inventory." };
      }
      if (!existsSync(suppliersPath)) {
        return { error: "No suppliers.json found. Reference data is missing." };
      }
      if (!existsSync(warehousesPath)) {
        return { error: "No warehouses.json found. Reference data is missing." };
      }

      try {
        const result = applySync({
          proposedPath,
          inventoryPath,
          dataDir,
          dryRun: true,
        });
        return {
          dryRun: true,
          result: {
            productCount: result.productCount,
            listingCount: result.listingCount,
            contractCount: result.contractCount,
            lotCount: result.lotCount,
            warehouseCount: result.warehouseCount,
            supplierCount: result.supplierCount,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "Sync already in progress") {
          return { error: "Sync already in progress" };
        }
        console.error("[agent] dry_run_sync error:", err);
        return { error: "Dry-run failed" };
      }
    }

    case "import_inventory_file": {
      const fileName = String(input.fileName ?? "");
      if (!fileName) {
        return { error: "fileName is required" };
      }

      // Resolve file from fileMap with fuzzy matching (same pattern as upload_document)
      let fileData = fileMap.get(fileName);
      if (!fileData) {
        const lower = fileName.toLowerCase();
        for (const [key, data] of fileMap) {
          if (key.toLowerCase() === lower || data.name.toLowerCase() === lower) {
            fileData = data;
            break;
          }
        }
      }
      if (!fileData) {
        const available = Array.from(fileMap.keys()).join(", ");
        return { error: `File '${fileName}' not found. Available files: ${available || "(none)"}` };
      }

      const dataDir = join(process.cwd(), "data");

      try {
        const result = importFromBuffer(fileData.buffer, dataDir);
        const { included, review, warnings, stats } = result;

        // Write inventory-proposed.json
        const proposedPath = join(dataDir, "inventory-proposed.json");
        writeFileSync(proposedPath, JSON.stringify(included, null, 2));

        // Write import-review.json if there are soft-excluded items
        const reviewPath = join(dataDir, "import-review.json");
        if (review.length > 0) {
          const sanitizedReview = review.map((r) => ({
            reason: r.reason,
            ruleType: r.ruleType,
            product: r.row.Stock_Description,
            specification: r.row.Stock_Specification,
            warehouse: r.row.Stock_Cold_Store,
            supplier: r.row.Stock_Contract_Supplier,
            origin: r.row.Stock_Origin_Country,
            contract: r.row.Stock_Contract,
            cases: r.row.Qty_Cases,
            weight: r.row.Qty_Weight_Net_Bal,
            unit: r.row.Unit,
            reserved: r.row.Stock_Reserved,
            bbd: r.row.Stock_BestBefore,
            lotNumber: r.row.SML_LotNumber,
          }));
          writeFileSync(reviewPath, JSON.stringify(sanitizedReview, null, 2));
        }

        // Build review summary for the agent to present
        const reviewSummary = review.length > 0 ? formatReviewSummary(review) : null;

        return {
          success: true,
          stats: {
            totalRows: stats.totalRows,
            hardExcluded: stats.hardExcluded,
            softExcluded: stats.softExcluded,
            includedRows: stats.includedRows,
            includedProducts: stats.includedProducts,
            includedListings: stats.includedListings,
            includedWeightLbs: stats.includedWeightLbs,
            includedQuantity: stats.includedQuantity,
            hardExclusionBreakdown: stats.hardExclusionBreakdown,
            softExclusionBreakdown: stats.softExclusionBreakdown,
          },
          warnings: warnings.map((w) => ({ type: w.type, message: w.message, requiresAction: w.requiresAction })),
          reviewSummary,
          proposedPath: "data/inventory-proposed.json",
          reviewPath: review.length > 0 ? "data/import-review.json" : null,
        };
      } catch (err) {
        console.error("[agent] import_inventory_file error:", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { error: `Failed to parse file: ${msg}` };
      }
    }

    case "clear_new_arrivals": {
      const cleared = clearFlags("new_arrival");
      return { success: true, cleared };
    }

    case "create_discount_item": {
      const productId = String(input.productId ?? "");
      const lotNumber = String(input.lotNumber ?? "");
      const reason = String(input.reason ?? "") as DiscountReason;
      const notes = input.notes ? String(input.notes) : null;
      const askingPrice = input.askingPrice ? String(input.askingPrice) : null;

      if (!VALID_REASONS.includes(reason)) {
        return { error: `Invalid reason '${reason}'. Must be one of: ${VALID_REASONS.join(", ")}` };
      }
      if (!productId || !lotNumber) {
        return { error: "productId and lotNumber are required" };
      }

      try {
        const items = addDiscountItemsFromLots([
          { productId, lotNumber, reason, notes, askingPrice },
        ]);
        return { success: true, item: items[0] };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Failed to create discount item" };
      }
    }

    case "restore_discount_item": {
      const discountId = String(input.discountId ?? "");
      if (!discountId) return { error: "discountId is required" };

      const success = restoreToInventory(discountId);
      if (!success) return { error: `Discount item '${discountId}' not found` };
      return { success: true, message: `Item ${discountId} restored to regular inventory` };
    }

    case "save_coa_data": {
      const lotNumber = String(input.lotNumber ?? "");
      const productId = String(input.productId ?? "");
      const fields = input.fields as Record<string, unknown> | undefined;

      if (!lotNumber || lotNumber.length > 100) return { error: "lotNumber is required (max 100 chars)" };
      if (!productId || productId.length > 200) return { error: "productId is required (max 200 chars)" };
      if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length === 0) {
        return { error: "fields must be a non-empty object" };
      }
      if (Object.keys(fields).length > 50) {
        return { error: "Too many fields (max 50)" };
      }

      // Look up lot by number + product
      const db = getDb();
      const lot = db.prepare(
        `SELECT lo.id FROM lots lo
         JOIN listings li ON lo.listing_id = li.id
         WHERE li.product_id = ? AND lo.lot_number = ?`,
      ).get(productId, lotNumber) as { id: number } | undefined;

      if (!lot) return { error: `Lot '${lotNumber}' not found for product '${productId}'` };

      // Validate, normalize, and bound-check fields
      const { upsertCoaData } = await import("./coa-data");
      const cleanFields: Record<string, number | string> = {};
      for (const [key, value] of Object.entries(fields)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!normalizedKey || normalizedKey.length > 50) continue;
        if (typeof value === "number") {
          if (!Number.isFinite(value)) continue;
          cleanFields[normalizedKey] = value;
        } else if (typeof value === "string") {
          if (value.length > 500) continue;
          cleanFields[normalizedKey] = value;
        }
      }
      if (Object.keys(cleanFields).length === 0) {
        return { error: "No valid fields provided (values must be finite numbers or strings under 500 chars)" };
      }

      upsertCoaData(lot.id, cleanFields, "agent");
      return {
        success: true,
        message: `Saved COA data for lot ${lotNumber}: ${Object.keys(cleanFields).join(", ")}`,
        fields: cleanFields,
      };
    }

    default:
      return { error: `Unknown tool '${toolName}'` };
  }
}
