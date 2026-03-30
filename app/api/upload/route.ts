import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { auth } from "@/lib/auth";
import { addDocument, getUploadDir, getDocumentUrl, generateDocFilename } from "@/lib/documents";
import { getDb } from "@/lib/db";
import { getUploadsRoot } from "@/lib/paths";
import type { DocCategory } from "@/lib/documents";

const VALID_CATEGORIES: DocCategory[] = ["coa", "test-results", "specs", "labels", "photos"];
const LOT_CATEGORIES: DocCategory[] = ["coa", "test-results"];
const CONTRACT_CATEGORIES: DocCategory[] = ["specs", "labels", "photos"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Sanitize path segments to prevent directory traversal */
function safePath(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const productId = formData.get("productId") as string | null;
  const category = formData.get("category") as string | null;
  const lotIdsStr = formData.get("lotIds") as string | null;
  const baseContract = formData.get("baseContract") as string | null;
  const documentDate = formData.get("documentDate") as string | null;

  if (!file || !productId || !category) {
    return NextResponse.json({ error: "Missing file, productId, or category" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds maximum size of 50 MB" }, { status: 413 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF or image files." }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(category as DocCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const cat = category as DocCategory;
  const safeProductId = safePath(productId);

  // Validate association: lot-level docs need lotIds, contract-level docs need baseContract
  const lotIds = lotIdsStr ? lotIdsStr.split(",").map(Number).filter((n) => !isNaN(n) && n > 0) : [];
  if (LOT_CATEGORIES.includes(cat) && lotIds.length === 0) {
    return NextResponse.json({ error: "Lot-level documents require lotIds" }, { status: 400 });
  }
  if (CONTRACT_CATEGORIES.includes(cat) && !baseContract) {
    return NextResponse.json({ error: "Contract-level documents require baseContract" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const db = getDb();

  // Look up product name for filename
  const productRow = db.prepare("SELECT product FROM products WHERE id = ?").get(productId) as { product: string } | undefined;
  const productName = productRow?.product ?? productId;

  // Resolve lot number for stable storage path (lot IDs change on re-seed)
  let lotNumber: string | undefined;
  if (LOT_CATEGORIES.includes(cat) && lotIds.length > 0) {
    const lotRow = db.prepare("SELECT lot_number FROM lots WHERE id = ?").get(lotIds[0]) as { lot_number: string } | undefined;
    if (!lotRow) {
      return NextResponse.json({ error: `Lot ID ${lotIds[0]} not found` }, { status: 400 });
    }
    lotNumber = lotRow.lot_number;
  }

  // Look up COO for contract-level docs
  let countryOfOrigin: string | undefined;
  if (CONTRACT_CATEGORIES.includes(cat)) {
    const cooRow = db.prepare("SELECT country_of_origin FROM listings WHERE product_id = ? LIMIT 1").get(productId) as { country_of_origin: string } | undefined;
    countryOfOrigin = cooRow?.country_of_origin;
  }

  // Determine storage path (sanitize all user-provided segments)
  const storageOpts = LOT_CATEGORIES.includes(cat)
    ? { lotNumber: lotNumber! }
    : { baseContract: safePath(baseContract!) };

  const dir = getUploadDir(safeProductId, category, storageOpts);

  const filename = generateDocFilename({
    category: cat,
    productName,
    originalName: file.name,
    documentDate: documentDate || undefined,
    lotNumber,
    baseContract: CONTRACT_CATEGORIES.includes(cat) ? baseContract! : undefined,
    countryOfOrigin,
    targetDir: dir,
  });

  const filepath = join(dir, filename);

  // Verify the resolved path stays within the uploads directory
  const uploadsRoot = resolve(getUploadsRoot());
  if (!resolve(filepath).startsWith(uploadsRoot + "/")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  mkdirSync(dir, { recursive: true }); // ensure directory exists (belt-and-suspenders)
  writeFileSync(filepath, buffer);

  const docId = `${productId}-${category}-${Date.now()}`;
  try {
    addDocument({
      id: docId,
      productId,
      category: cat,
      filename,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.user.email || "unknown",
      baseContract: CONTRACT_CATEGORIES.includes(cat) ? baseContract : null,
      lotIds: LOT_CATEGORIES.includes(cat) ? lotIds : undefined,
    });
  } catch (err) {
    // Clean up the written file to avoid orphaned files
    try { unlinkSync(filepath); } catch { /* best-effort */ }
    throw err;
  }

  const url = getDocumentUrl(productId, category, filename, storageOpts);

  // Fire-and-forget COA data extraction via Claude vision
  if (cat === "coa" && lotIds.length > 0) {
    // Clone buffer to ensure it survives past the HTTP response
    const bufferCopy = Buffer.from(buffer);
    const extractLotIds = [...lotIds];
    import("@/lib/coa-extract").then(({ extractCoaData }) => {
      extractCoaData(bufferCopy, file.type).then((fields) => {
        if (fields) {
          import("@/lib/coa-data").then(({ upsertCoaData }) => {
            for (const lid of extractLotIds) {
              try {
                upsertCoaData(lid, fields, "auto-extract");
              } catch (err) {
                console.warn(`COA data upsert failed for lot ${lid}:`, err instanceof Error ? err.message : err);
              }
            }
            console.log(`COA data extracted for lot(s) ${extractLotIds.join(",")}: ${Object.keys(fields).join(", ")}`);
          });
        }
      }).catch((err) => {
        console.warn("COA auto-extraction failed (non-blocking):", err instanceof Error ? err.message : err);
      });
    });
  }

  return NextResponse.json({
    success: true,
    document: { id: docId, filename, url },
  });
}
