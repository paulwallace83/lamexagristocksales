import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getDb } from "./db";
import { getInventory } from "./inventory-db";
import type { Product } from "./inventory";

export interface DocumentEntry {
  id: string;
  productId: string;
  category: "coa" | "test-results" | "labels" | "photos";
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface DocumentsData {
  documents: DocumentEntry[];
}

export function getDocuments(): DocumentsData {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM documents").all() as Array<{
    id: string; product_id: string; category: string;
    filename: string; original_name: string; uploaded_at: string; uploaded_by: string;
  }>;

  return {
    documents: rows.map(toDocumentEntry),
  };
}

export function getDocumentsForProduct(productId: string): DocumentEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM documents WHERE product_id = ?").all(productId) as Array<{
    id: string; product_id: string; category: string;
    filename: string; original_name: string; uploaded_at: string; uploaded_by: string;
  }>;

  return rows.map(toDocumentEntry);
}

export function addDocument(entry: DocumentEntry): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.productId, entry.category, entry.filename, entry.originalName, entry.uploadedAt, entry.uploadedBy);
}

export function removeDocument(productId: string, documentId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM documents WHERE product_id = ? AND id = ?").run(productId, documentId);
  return result.changes > 0;
}

export function getUploadDir(productId: string, category: string): string {
  const dir = join(process.cwd(), "public", "uploads", productId, category);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export type DocCategory = "coa" | "test-results" | "labels" | "photos";

const ALL_CATEGORIES: DocCategory[] = ["coa", "test-results", "labels", "photos"];

export function getRequiredCategories(product: Product): DocCategory[] {
  const isJuiceOrPuree =
    product.format === "Juice Concentrate" || product.format === "Puree";

  if (isJuiceOrPuree) {
    return ["coa", "test-results", "labels"];
  }
  return ALL_CATEGORIES;
}

export function getCategoryLabel(category: DocCategory): string {
  switch (category) {
    case "coa":
      return "Certificates of Analysis (COA)";
    case "test-results":
      return "Pesticide & Test Results";
    case "labels":
      return "Label Photos";
    case "photos":
      return "Product Photos";
  }
}

export interface ProductDocStatus {
  productId: string;
  product: string;
  requiredCategories: DocCategory[];
  uploaded: Record<DocCategory, number>;
  complete: boolean;
}

export function getDocumentStatus(): ProductDocStatus[] {
  const { products } = getInventory();
  const { documents } = getDocuments();

  return products.map((p) => {
    const required = getRequiredCategories(p);
    const productDocs = documents.filter((d) => d.productId === p.id);
    const uploaded: Record<string, number> = {};

    for (const cat of ALL_CATEGORIES) {
      uploaded[cat] = productDocs.filter((d) => d.category === cat).length;
    }

    const complete = required.every((cat) => uploaded[cat] > 0);

    return {
      productId: p.id,
      product: p.product,
      requiredCategories: required,
      uploaded: uploaded as Record<DocCategory, number>,
      complete,
    };
  });
}

function toDocumentEntry(row: {
  id: string; product_id: string; category: string;
  filename: string; original_name: string; uploaded_at: string; uploaded_by: string;
}): DocumentEntry {
  return {
    id: row.id,
    productId: row.product_id,
    category: row.category as DocumentEntry["category"],
    filename: row.filename,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}
