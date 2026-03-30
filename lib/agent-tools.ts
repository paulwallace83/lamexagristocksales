import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  getProductSummaries,
  findLotsByNumber,
  findLotsByNumbers,
  findByContractNumber,
  searchProducts,
  getSyncInfo,
  getTestResultCoverage,
} from "./agent-db";
import { getProductById } from "./inventory-db";
import { getDb } from "./db";
import { getDocumentStatus, addDocument, getUploadDir, getDocumentUrl } from "./documents";
import { getDiscountItems, addDiscountItemsFromLots, restoreToInventory } from "./discount";
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
  input: { productId: string; category: string; fileRef: string; originalName: string; lotIds?: number[]; baseContract?: string },
  fileMap: Map<string, FileData>,
  uploaderEmail: string,
): UploadResult {
  const { productId, fileRef, originalName } = input;
  const category = input.category as DocCategory;
  const lotIds = input.lotIds ?? [];
  const baseContract = input.baseContract;

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
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = `${Date.now()}-${uploadCounter++}`;
  const filename = `${timestamp}-${safeName}`;

  // Resolve lot number for stable storage path (lot IDs change on re-seed)
  let lotNumber: string | undefined;
  if (LOT_CATEGORIES.includes(category) && lotIds.length > 0) {
    const lotRow = getDb().prepare("SELECT lot_number FROM lots WHERE id = ?").get(lotIds[0]) as { lot_number: string } | undefined;
    if (!lotRow) return { success: false, error: `Lot ID ${lotIds[0]} not found in database` };
    lotNumber = lotRow.lot_number;
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

  const filepath = join(dir, filename);
  const uploadsRoot = resolve(getUploadsRoot());
  if (!resolve(filepath).startsWith(uploadsRoot)) {
    return { success: false, error: "Invalid upload path" };
  }

  writeFileSync(filepath, fileData.buffer);

  const docId = `${productId}-${category}-${timestamp}`;
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

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  fileMap: Map<string, FileData>,
  uploaderEmail: string,
): Promise<unknown> {
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
