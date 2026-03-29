import { NextRequest, NextResponse } from "next/server";
import { unlinkSync, existsSync } from "fs";
import { join, resolve } from "path";
import { auth } from "@/lib/auth";
import { getDocumentsForProduct, removeDocument, getDocumentUrl } from "@/lib/documents";
import { getUploadsRoot } from "@/lib/paths";

/** Sanitize path segments to prevent directory traversal */
function safePath(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await params;
  const documents = getDocumentsForProduct(productId);

  const withUrls = documents.map((d) => ({
    ...d,
    url: getDocumentUrl(d.productId, d.category, d.filename, {
      lotNumber: d.lotNumbers.length > 0 ? d.lotNumbers[0] : undefined,
      baseContract: d.baseContract ?? undefined,
    }),
  }));

  return NextResponse.json({ documents: withUrls });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await params;
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  const filename = searchParams.get("filename");
  const category = searchParams.get("category");
  const lotId = searchParams.get("lotId");
  const baseContract = searchParams.get("baseContract");

  if (!documentId || !filename || !category) {
    return NextResponse.json({ error: "Missing documentId, filename, or category" }, { status: 400 });
  }

  // Sanitize all path segments to prevent directory traversal
  const safeProductId = safePath(productId);
  const safeFilename = safePath(filename);
  const safeCategory = safePath(category);
  const uploadsRoot = resolve(getUploadsRoot());

  let filepath: string;
  if (lotId) {
    filepath = join(uploadsRoot, safeProductId, "lots", safePath(lotId), safeCategory, safeFilename);
  } else if (baseContract) {
    filepath = join(uploadsRoot, safeProductId, "contracts", safePath(baseContract), safeCategory, safeFilename);
  } else {
    filepath = join(uploadsRoot, safeProductId, safeCategory, safeFilename);
  }

  // Final guard: ensure resolved path stays within uploads directory
  if (!resolve(filepath).startsWith(uploadsRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }

  const removed = removeDocument(productId, documentId);
  if (!removed) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
