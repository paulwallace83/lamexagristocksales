import { NextRequest, NextResponse } from "next/server";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { auth } from "@/lib/auth";
import { getDocumentsForProduct, removeDocument } from "@/lib/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const documents = getDocumentsForProduct(productId);

  const withUrls = documents.map((d) => ({
    ...d,
    url: `/uploads/${d.productId}/${d.category}/${d.filename}`,
  }));

  return NextResponse.json({ documents: withUrls });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await params;
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  const filename = searchParams.get("filename");
  const category = searchParams.get("category");

  if (!documentId || !filename || !category) {
    return NextResponse.json({ error: "Missing documentId, filename, or category" }, { status: 400 });
  }

  const filepath = join(process.cwd(), "public", "uploads", productId, category, filename);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }

  const removed = removeDocument(productId, documentId);
  if (!removed) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
