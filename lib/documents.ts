import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getInventory, Product } from "./inventory";

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

const DOCUMENTS_PATH = join(process.cwd(), "data", "documents.json");

export function getDocuments(): DocumentsData {
  try {
    const data = readFileSync(DOCUMENTS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { documents: [] };
  }
}

export function saveDocuments(data: DocumentsData): void {
  writeFileSync(DOCUMENTS_PATH, JSON.stringify(data, null, 2));
}

export function getDocumentsForProduct(productId: string): DocumentEntry[] {
  const { documents } = getDocuments();
  return documents.filter((d) => d.productId === productId);
}

export function addDocument(entry: DocumentEntry): void {
  const data = getDocuments();
  data.documents.push(entry);
  saveDocuments(data);
}

export function removeDocument(productId: string, documentId: string): boolean {
  const data = getDocuments();
  const idx = data.documents.findIndex(
    (d) => d.productId === productId && d.id === documentId
  );
  if (idx === -1) return false;
  data.documents.splice(idx, 1);
  saveDocuments(data);
  return true;
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
