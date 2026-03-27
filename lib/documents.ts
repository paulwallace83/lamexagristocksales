import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getDb } from "./db";
import { getInventory } from "./inventory-db";
import type { Product } from "./inventory";
import { extractBaseContract, getBaseContracts, getAllLots } from "./inventory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DocCategory = "coa" | "test-results" | "specs" | "labels" | "photos";

export interface DocumentEntry {
  id: string;
  productId: string;
  category: DocCategory;
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  baseContract: string | null;
  lotIds: number[];
}

export interface DocumentsData {
  documents: DocumentEntry[];
}

export interface RequiredDocs {
  lotLevel: DocCategory[];
  contractLevel: DocCategory[];
}

export interface ProductDocStatus {
  productId: string;
  product: string;
  requiredDocs: RequiredDocs;
  lotCount: number;
  lotsWithCOA: number;
  contractCount: number;
  contractsWithSpecs: number;
  contractsWithLabels: number;
  contractsWithPhotos: number;
  complete: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LOT_LEVEL_CATEGORIES: DocCategory[] = ["coa", "test-results"];
const ALL_CONTRACT_CATEGORIES: DocCategory[] = ["specs", "labels", "photos"];

/* ------------------------------------------------------------------ */
/*  Category helpers                                                   */
/* ------------------------------------------------------------------ */

export function getRequiredDocs(product: Product): RequiredDocs {
  const isJuiceOrPuree =
    product.format === "Juice Concentrate" || product.format === "Puree";

  return {
    lotLevel: LOT_LEVEL_CATEGORIES,
    contractLevel: isJuiceOrPuree ? ["specs", "labels"] : ALL_CONTRACT_CATEGORIES,
  };
}

export function getCategoryLabel(category: DocCategory): string {
  switch (category) {
    case "coa":
      return "Certificates of Analysis (COA)";
    case "test-results":
      return "Pesticide & Test Results";
    case "specs":
      return "Specification Sheets";
    case "labels":
      return "Label Photos";
    case "photos":
      return "Product Photos";
  }
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

function toDocumentEntry(
  row: {
    id: string; product_id: string; category: string;
    filename: string; original_name: string; uploaded_at: string;
    uploaded_by: string; base_contract: string | null;
  },
  lotIds: number[] = [],
): DocumentEntry {
  return {
    id: row.id,
    productId: row.product_id,
    category: row.category as DocCategory,
    filename: row.filename,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    baseContract: row.base_contract,
    lotIds,
  };
}

type DocRow = {
  id: string; product_id: string; category: string;
  filename: string; original_name: string; uploaded_at: string;
  uploaded_by: string; base_contract: string | null;
};

function attachLotIds(docs: DocRow[]): DocumentEntry[] {
  if (docs.length === 0) return [];
  const db = getDb();
  const docIds = docs.map((d) => d.id);
  const placeholders = docIds.map(() => "?").join(",");
  const links = db.prepare(
    `SELECT document_id, lot_id FROM document_lots WHERE document_id IN (${placeholders})`,
  ).all(...docIds) as Array<{ document_id: string; lot_id: number }>;

  const lotIdsByDoc = new Map<string, number[]>();
  for (const link of links) {
    const arr = lotIdsByDoc.get(link.document_id) ?? [];
    arr.push(link.lot_id);
    lotIdsByDoc.set(link.document_id, arr);
  }

  return docs.map((row) => toDocumentEntry(row, lotIdsByDoc.get(row.id) ?? []));
}

export function getDocuments(): DocumentsData {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM documents").all() as DocRow[];
  return { documents: attachLotIds(rows) };
}

export function getDocumentsForProduct(productId: string): DocumentEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM documents WHERE product_id = ?").all(productId) as DocRow[];
  return attachLotIds(rows);
}

export function getDocumentsForLot(lotId: number): DocumentEntry[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT d.* FROM documents d
     JOIN document_lots dl ON dl.document_id = d.id
     WHERE dl.lot_id = ?`,
  ).all(lotId) as DocRow[];
  return attachLotIds(rows);
}

export function getDocumentsForContract(baseContract: string): DocumentEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM documents WHERE base_contract = ?",
  ).all(baseContract) as DocRow[];
  return attachLotIds(rows);
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                   */
/* ------------------------------------------------------------------ */

export function addDocument(entry: {
  id: string;
  productId: string;
  category: DocCategory;
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  baseContract?: string | null;
  lotIds?: number[];
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by, base_contract)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id, entry.productId, entry.category, entry.filename,
    entry.originalName, entry.uploadedAt, entry.uploadedBy,
    entry.baseContract ?? null,
  );

  if (entry.lotIds && entry.lotIds.length > 0) {
    const insert = db.prepare("INSERT INTO document_lots (document_id, lot_id) VALUES (?, ?)");
    for (const lotId of entry.lotIds) {
      insert.run(entry.id, lotId);
    }
  }
}

export function removeDocument(productId: string, documentId: string): boolean {
  const db = getDb();
  // document_lots has ON DELETE CASCADE, but better-sqlite3 needs foreign_keys pragma
  db.pragma("foreign_keys = ON");
  const result = db.prepare("DELETE FROM documents WHERE product_id = ? AND id = ?").run(productId, documentId);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  File storage                                                       */
/* ------------------------------------------------------------------ */

export function getUploadDir(productId: string, category: string, opts?: { lotId?: number; baseContract?: string }): string {
  let dir: string;
  if (opts?.lotId != null) {
    dir = join(process.cwd(), "public", "uploads", productId, "lots", String(opts.lotId), category);
  } else if (opts?.baseContract != null) {
    dir = join(process.cwd(), "public", "uploads", productId, "contracts", opts.baseContract, category);
  } else {
    // Legacy fallback
    dir = join(process.cwd(), "public", "uploads", productId, category);
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Build the public URL path for a document. */
export function getDocumentUrl(productId: string, category: string, filename: string, opts?: { lotId?: number; baseContract?: string }): string {
  if (opts?.lotId != null) {
    return `/uploads/${productId}/lots/${opts.lotId}/${category}/${filename}`;
  } else if (opts?.baseContract != null) {
    return `/uploads/${productId}/contracts/${opts.baseContract}/${category}/${filename}`;
  }
  return `/uploads/${productId}/${category}/${filename}`;
}

/* ------------------------------------------------------------------ */
/*  Status / dashboard                                                 */
/* ------------------------------------------------------------------ */

export function getDocumentStatus(): ProductDocStatus[] {
  const { products } = getInventory();
  const { documents } = getDocuments();

  return products.map((p) => {
    const required = getRequiredDocs(p);
    const productDocs = documents.filter((d) => d.productId === p.id);
    const lots = getAllLots(p);
    const baseContracts = getBaseContracts(p);

    // Count lots that have at least one COA
    const lotIdsWithCOA = new Set<number>();
    for (const doc of productDocs) {
      if (doc.category === "coa") {
        for (const lotId of doc.lotIds) {
          lotIdsWithCOA.add(lotId);
        }
      }
    }

    // Count contracts with docs
    const contractsWithSpecs = new Set(
      productDocs.filter((d) => d.category === "specs" && d.baseContract).map((d) => d.baseContract!),
    ).size;
    const contractsWithLabels = new Set(
      productDocs.filter((d) => d.category === "labels" && d.baseContract).map((d) => d.baseContract!),
    ).size;
    const contractsWithPhotos = new Set(
      productDocs.filter((d) => d.category === "photos" && d.baseContract).map((d) => d.baseContract!),
    ).size;

    const lotComplete = lots.length === 0 || lotIdsWithCOA.size >= lots.length;
    const contractComplete =
      baseContracts.length === 0 ||
      (contractsWithSpecs >= baseContracts.length &&
        contractsWithLabels >= baseContracts.length &&
        (required.contractLevel.includes("photos") ? contractsWithPhotos >= baseContracts.length : true));

    return {
      productId: p.id,
      product: p.product,
      requiredDocs: required,
      lotCount: lots.length,
      lotsWithCOA: lotIdsWithCOA.size,
      contractCount: baseContracts.length,
      contractsWithSpecs,
      contractsWithLabels,
      contractsWithPhotos,
      complete: lotComplete && contractComplete,
    };
  });
}
