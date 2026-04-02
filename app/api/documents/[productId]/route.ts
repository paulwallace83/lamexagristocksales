import { NextRequest, NextResponse } from "next/server";
import { unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { auth } from "@/lib/auth";
import { getDocumentsForProduct, removeDocument, getDocumentUrl, getUploadDir } from "@/lib/documents";
import type { DocCategory } from "@/lib/documents";

const VALID_CATEGORIES: DocCategory[] = ["coa", "test-results", "specs", "labels", "photos"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { productId } = await params;
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  const filename = searchParams.get("filename");
  const category = searchParams.get("category");
  const lotNumber = searchParams.get("lotNumber");
  const baseContract = searchParams.get("baseContract");

  if (!documentId || !filename || !category) {
    return NextResponse.json({ error: "Missing documentId, filename, or category" }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(category as DocCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Remove DB record first — only delete the physical file if the record existed
  const removed = removeDocument(productId, documentId);
  if (!removed) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Use getUploadDir() for path construction — same function used by upload route
  // to guarantee consistent sanitization (safeSeg allowlist)
  try {
    const dir = getUploadDir(productId, category, {
      lotNumber: lotNumber ?? undefined,
      baseContract: baseContract ?? undefined,
    });
    // Sanitize filename with the same allowlist pattern as safeSeg
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filepath = resolve(dir, safeFilename);
    if (filepath.startsWith(resolve(dir) + "/") && existsSync(filepath)) {
      unlinkSync(filepath);
    }
  } catch {
    // Path construction failed (e.g., traversal attempt) — DB record already removed,
    // log and continue. The orphaned file is preferable to an error after DB commit.
  }

  return NextResponse.json({ success: true });
}
