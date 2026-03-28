import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import { join } from "path";
import { auth } from "@/lib/auth";
import { addDocument, getUploadDir, getDocumentUrl } from "@/lib/documents";
import type { DocCategory } from "@/lib/documents";

const VALID_CATEGORIES: DocCategory[] = ["coa", "test-results", "specs", "labels", "photos"];
const LOT_CATEGORIES: DocCategory[] = ["coa", "test-results"];
const CONTRACT_CATEGORIES: DocCategory[] = ["specs", "labels", "photos"];

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

  // Determine storage path (sanitize all user-provided segments)
  const storageOpts = LOT_CATEGORIES.includes(cat)
    ? { lotId: lotIds[0] }
    : { baseContract: safePath(baseContract!) };

  const dir = getUploadDir(safeProductId, category, storageOpts);
  const filepath = join(dir, filename);
  writeFileSync(filepath, buffer);

  const docId = `${productId}-${category}-${timestamp}`;
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

  const url = getDocumentUrl(productId, category, filename, storageOpts);

  return NextResponse.json({
    success: true,
    document: { id: docId, filename, url },
  });
}
