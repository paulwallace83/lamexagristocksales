import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { getDb } from "./db";
import { getInventory } from "./inventory-db";
import type { Product } from "./inventory";
import { extractBaseContract, getBaseContracts, getAllLots } from "./inventory";
import { getUploadsRoot } from "./paths";

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
  lotNumbers: string[];
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
  format: string;
  organic: boolean;
  requiredDocs: RequiredDocs;
  lotCount: number;
  lotsWithCOA: number;
  lotsWithTestResults: number;
  expectedTest: "heavy-metals" | "pesticide" | null;
  lots: Array<{
    id: number;
    lotNumber: string;
    bbd: string;
    contracts: string[];
    supplier: string;
    hasCOA: boolean;
    hasTestResult: boolean;
  }>;
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

/** Short label for filenames */
export function getShortCategoryLabel(category: DocCategory): string {
  switch (category) {
    case "coa":
      return "COA";
    case "test-results":
      return "Test Results";
    case "specs":
      return "Spec Sheet";
    case "labels":
      return "Label";
    case "photos":
      return "Product Photo";
  }
}

/**
 * Generate a descriptive filename for uploaded documents.
 *
 * Lot-level:     YYYY-MM-DD. {Product} - {Type} - {LotNumber}.{ext}
 * Contract-level: YYYY-MM-DD. {Product} - {Contract} | {COO} | {Type}.{ext}
 */
export function generateDocFilename(opts: {
  category: DocCategory;
  productName: string;
  originalName: string;
  documentDate?: string; // YYYY-MM-DD; defaults to today
  lotNumber?: string;
  baseContract?: string;
  countryOfOrigin?: string;
  targetDir: string;
}): string {
  const date = opts.documentDate || new Date().toISOString().slice(0, 10);
  const ext = getExtension(opts.originalName);
  const typeLabel = getShortCategoryLabel(opts.category);
  const product = sanitizeSegment(opts.productName);

  let base: string;
  if (opts.lotNumber) {
    // Lot-level: YYYY-MM-DD. {Product} - {Type} - {LotNumber}
    base = `${date}. ${product} - ${typeLabel} - ${opts.lotNumber}`;
  } else if (opts.baseContract) {
    // Contract-level: YYYY-MM-DD. {Product} - {Contract} | {COO} | {Type}
    const coo = opts.countryOfOrigin || "Unknown";
    base = `${date}. ${product} - ${opts.baseContract} | ${coo} | ${typeLabel}`;
  } else {
    // Fallback
    base = `${date}. ${product} - ${typeLabel}`;
  }

  // Ensure uniqueness on disk
  let filename = `${base}${ext}`;
  if (existsSync(join(opts.targetDir, filename))) {
    let counter = 2;
    while (existsSync(join(opts.targetDir, `${base}-${counter}${ext}`))) {
      counter++;
    }
    filename = `${base}-${counter}${ext}`;
  }

  return filename;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Remove characters unsafe for filenames but keep spaces, dots, pipes, hyphens */
function sanitizeSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

function toDocumentEntry(
  row: {
    id: string; product_id: string; category: string;
    filename: string; original_name: string; uploaded_at: string;
    uploaded_by: string; base_contract: string | null;
    lot_numbers?: string | null;
  },
  lotIds: number[] = [],
): DocumentEntry {
  let lotNumbers: string[] = [];
  if (row.lot_numbers) {
    try { lotNumbers = JSON.parse(row.lot_numbers); } catch { /* ignore */ }
  }
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
    lotNumbers,
  };
}

type DocRow = {
  id: string; product_id: string; category: string;
  filename: string; original_name: string; uploaded_at: string;
  uploaded_by: string; base_contract: string | null;
  lot_numbers: string | null;
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

  // Resolve lot IDs → lot numbers so we can re-link after sync/seed
  let lotNumbersJson: string | null = null;
  if (entry.lotIds && entry.lotIds.length > 0) {
    const placeholders = entry.lotIds.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT lot_number FROM lots WHERE id IN (${placeholders})`,
    ).all(...entry.lotIds) as Array<{ lot_number: string }>;
    if (rows.length > 0) {
      lotNumbersJson = JSON.stringify(rows.map((r) => r.lot_number));
    }
  }

  const insertDoc = db.prepare(`
    INSERT INTO documents (id, product_id, category, filename, original_name, uploaded_at, uploaded_by, base_contract, lot_numbers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLot = db.prepare("INSERT INTO document_lots (document_id, lot_id) VALUES (?, ?)");

  db.transaction(() => {
    insertDoc.run(
      entry.id, entry.productId, entry.category, entry.filename,
      entry.originalName, entry.uploadedAt, entry.uploadedBy,
      entry.baseContract ?? null,
      lotNumbersJson,
    );
    if (entry.lotIds && entry.lotIds.length > 0) {
      for (const lotId of entry.lotIds) {
        insertLot.run(entry.id, lotId);
      }
    }
  })();
}

/**
 * Re-link document_lots after lots have been re-seeded (lot IDs change each seed/sync).
 * Reads lot_numbers JSON from each document and resolves to current lot IDs.
 * Returns count of associations created.
 */
export function relinkDocumentLots(): { linked: number; orphaned: number } {
  const db = getDb();
  let linked = 0;
  let orphaned = 0;

  const docs = db.prepare(
    "SELECT id, product_id, lot_numbers FROM documents WHERE lot_numbers IS NOT NULL AND lot_numbers != '[]'",
  ).all() as Array<{ id: string; product_id: string; lot_numbers: string }>;

  const insertLink = db.prepare("INSERT OR IGNORE INTO document_lots (document_id, lot_id) VALUES (?, ?)");

  for (const doc of docs) {
    let lotNumbers: string[];
    try {
      lotNumbers = JSON.parse(doc.lot_numbers);
    } catch {
      continue;
    }
    if (!Array.isArray(lotNumbers) || lotNumbers.length === 0) continue;

    // Find lots by number within this product's listings
    for (const lotNum of lotNumbers) {
      const lot = db.prepare(`
        SELECT lo.id FROM lots lo
        JOIN listings li ON lo.listing_id = li.id
        WHERE li.product_id = ? AND lo.lot_number = ?
      `).get(doc.product_id, lotNum) as { id: number } | undefined;

      if (lot) {
        insertLink.run(doc.id, lot.id);
        linked++;
      } else {
        orphaned++;
      }
    }
  }

  return { linked, orphaned };
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

/** Sanitize a path segment to prevent directory traversal. */
function safeSeg(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getUploadDir(productId: string, category: string, opts?: { lotId?: number; lotNumber?: string; baseContract?: string }): string {
  const pid = safeSeg(productId);
  const cat = safeSeg(category);
  let dir: string;
  const uploadsRoot = getUploadsRoot();
  if (opts?.lotNumber != null) {
    dir = join(uploadsRoot, pid, "lots", safeSeg(opts.lotNumber), cat);
  } else if (opts?.lotId != null) {
    dir = join(uploadsRoot, pid, "lots", String(opts.lotId), cat);
  } else if (opts?.baseContract != null) {
    dir = join(uploadsRoot, pid, "contracts", safeSeg(opts.baseContract), cat);
  } else {
    dir = join(uploadsRoot, pid, cat);
  }
  if (!resolve(dir).startsWith(uploadsRoot)) {
    throw new Error("Invalid upload path");
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Build the public URL path for a document. All segments are sanitized.
 *  Structural segments (productId, category, lotNumber, baseContract) go through
 *  safeSeg since they are slug-style identifiers. The filename is only
 *  URI-encoded — safeSeg would corrupt spaces and pipes introduced by the
 *  descriptive naming convention (e.g. "2026-03-28. Apple JC - COA - lot.pdf").
 */
export function getDocumentUrl(productId: string, category: string, filename: string, opts?: { lotId?: number; lotNumber?: string; baseContract?: string }): string {
  const pid = encodeURIComponent(safeSeg(productId));
  const cat = encodeURIComponent(safeSeg(category));
  const fn = encodeURIComponent(filename);
  if (opts?.lotNumber != null) {
    return `/api/files/${pid}/lots/${encodeURIComponent(safeSeg(opts.lotNumber))}/${cat}/${fn}`;
  } else if (opts?.lotId != null) {
    return `/api/files/${pid}/lots/${opts.lotId}/${cat}/${fn}`;
  } else if (opts?.baseContract != null) {
    return `/api/files/${pid}/contracts/${encodeURIComponent(safeSeg(opts.baseContract))}/${cat}/${fn}`;
  }
  return `/api/files/${pid}/${cat}/${fn}`;
}

/* ------------------------------------------------------------------ */
/*  Status / dashboard                                                 */
/* ------------------------------------------------------------------ */

/** Quick check: does this product have at least one document uploaded? */
export function productHasDocs(productId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM documents WHERE product_id = ? LIMIT 1").get(productId);
  return row != null;
}

/** Map of productId → boolean for all products with docs. */
export function getProductDocMap(): Map<string, boolean> {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT product_id FROM documents").all() as Array<{ product_id: string }>;
  const map = new Map<string, boolean>();
  for (const r of rows) {
    map.set(r.product_id, true);
  }
  return map;
}

/** Get the first product photo URL for a product (if any). */
export function getProductPhotoUrl(productId: string): string | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT filename, base_contract FROM documents WHERE product_id = ? AND category = 'photos' LIMIT 1",
  ).get(productId) as { filename: string; base_contract: string | null } | undefined;
  if (!row) return null;
  const pid = encodeURIComponent(safeSeg(productId));
  const fn = encodeURIComponent(safeSeg(row.filename));
  if (row.base_contract) {
    const bc = encodeURIComponent(safeSeg(row.base_contract));
    return `/uploads/${pid}/contracts/${bc}/photos/${fn}`;
  }
  return `/uploads/${pid}/photos/${fn}`;
}

export function getDocumentStatus(): ProductDocStatus[] {
  const { products } = getInventory();
  const { documents } = getDocuments();

  return products.map((p) => {
    const required = getRequiredDocs(p);
    const productDocs = documents.filter((d) => d.productId === p.id);
    const lots = getAllLots(p);
    const baseContracts = getBaseContracts(p);

    // Map lot IDs to their parent listing's supplier (real name, not "Various")
    const lotSupplier = new Map<number, string>();
    for (const listing of p.listings) {
      for (const lot of listing.lots) {
        lotSupplier.set(lot.id, listing.supplier);
      }
    }

    // Count lots that have at least one COA
    const lotIdsWithCOA = new Set<number>();
    const lotIdsWithTestResult = new Set<number>();
    for (const doc of productDocs) {
      if (doc.category === "coa") {
        for (const lotId of doc.lotIds) lotIdsWithCOA.add(lotId);
      }
      if (doc.category === "test-results") {
        for (const lotId of doc.lotIds) lotIdsWithTestResult.add(lotId);
      }
    }

    // Determine expected test type
    const isJC = p.format === "Juice Concentrate";
    const expectedTest: "heavy-metals" | "pesticide" | null = isJC
      ? "heavy-metals"
      : p.organic
        ? "pesticide"
        : null;

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
      format: p.format,
      organic: p.organic,
      requiredDocs: required,
      lotCount: lots.length,
      lotsWithCOA: lotIdsWithCOA.size,
      lotsWithTestResults: lotIdsWithTestResult.size,
      expectedTest,
      lots: lots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        bbd: lot.bbd,
        contracts: lot.contracts,
        supplier: lotSupplier.get(lot.id) || "",
        hasCOA: lotIdsWithCOA.has(lot.id),
        hasTestResult: lotIdsWithTestResult.has(lot.id),
      })),
      contractCount: baseContracts.length,
      contractsWithSpecs,
      contractsWithLabels,
      contractsWithPhotos,
      complete: lotComplete && contractComplete,
    };
  });
}
