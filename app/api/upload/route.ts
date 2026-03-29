import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { auth } from "@/lib/auth";
import { addDocument, getUploadDir, getDocumentUrl } from "@/lib/documents";
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

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${timestamp}-${safeName}`;

  // Resolve lot number for stable storage path (lot IDs change on re-seed)
  let lotNumber: string | undefined;
  if (LOT_CATEGORIES.includes(cat) && lotIds.length > 0) {
    const db = getDb();
    const lotRow = db.prepare("SELECT lot_number FROM lots WHERE id = ?").get(lotIds[0]) as { lot_number: string } | undefined;
    if (!lotRow) {
      return NextResponse.json({ error: `Lot ID ${lotIds[0]} not found` }, { status: 400 });
    }
    lotNumber = lotRow.lot_number;
  }

  // Determine storage path (sanitize all user-provided segments)
  const storageOpts = LOT_CATEGORIES.includes(cat)
    ? { lotNumber: lotNumber! }
    : { baseContract: safePath(baseContract!) };

  const dir = getUploadDir(safeProductId, category, storageOpts);
  const filepath = join(dir, filename);

  // Verify the resolved path stays within the uploads directory
  const uploadsRoot = resolve(getUploadsRoot());
  if (!resolve(filepath).startsWith(uploadsRoot + "/")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  writeFileSync(filepath, buffer);

  const docId = `${productId}-${category}-${timestamp}`;
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

  return NextResponse.json({
    success: true,
    document: { id: docId, filename, url },
  });
}
