import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import { join } from "path";
import { auth } from "@/lib/auth";
import { addDocument, getUploadDir } from "@/lib/documents";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const productId = formData.get("productId") as string | null;
  const category = formData.get("category") as string | null;

  if (!file || !productId || !category) {
    return NextResponse.json({ error: "Missing file, productId, or category" }, { status: 400 });
  }

  const validCategories = ["coa", "test-results", "labels", "photos"];
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${timestamp}-${safeName}`;

  const dir = getUploadDir(productId, category);
  const filepath = join(dir, filename);
  writeFileSync(filepath, buffer);

  const docId = `${productId}-${category}-${timestamp}`;
  addDocument({
    id: docId,
    productId,
    category: category as "coa" | "test-results" | "labels" | "photos",
    filename,
    originalName: file.name,
    uploadedAt: new Date().toISOString(),
    uploadedBy: session.user.email || "unknown",
  });

  return NextResponse.json({
    success: true,
    document: {
      id: docId,
      filename,
      url: `/uploads/${productId}/${category}/${filename}`,
    },
  });
}
