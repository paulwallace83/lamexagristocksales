/**
 * lib/document-requests.ts — CRUD for the document_requests table.
 */

import { getDb } from "./db";
import { getProductById } from "./inventory-db";

// ── Types ──────────────────────────────────────────────────────────

export interface RequestedDocItem {
  lotNumber?: string;
  baseContract?: string;
  categories: ("coa" | "test-results" | "specs")[];
}

export interface DocumentRequest {
  id: number;
  productId: string;
  productName: string;
  requesterName: string;
  requesterCompany: string;
  requesterEmail: string;
  requesterPhone: string | null;
  message: string | null;
  requestedDocs: RequestedDocItem[];
  status: "pending" | "approved" | "rejected" | "sent";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  notes: string | null;
}

export interface CreateDocumentRequestInput {
  productId: string;
  requesterName: string;
  requesterCompany: string;
  requesterEmail: string;
  requesterPhone?: string;
  message?: string;
  requestedDocs: RequestedDocItem[];
}

// ── Helpers ────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set(["coa", "test-results", "specs"]);

function validateRequestedDocs(docs: RequestedDocItem[]): string | null {
  if (!Array.isArray(docs) || docs.length === 0) {
    return "requestedDocs must be a non-empty array";
  }
  for (const item of docs) {
    if (!item.lotNumber && !item.baseContract) {
      return "Each item must have lotNumber or baseContract";
    }
    if (!Array.isArray(item.categories) || item.categories.length === 0) {
      return "Each item must have at least one category";
    }
    for (const cat of item.categories) {
      if (!VALID_CATEGORIES.has(cat)) {
        return `Invalid category: ${cat}`;
      }
    }
  }
  return null;
}

interface RequestRow {
  id: number;
  product_id: string;
  product_name: string;
  requester_name: string;
  requester_company: string;
  requester_email: string;
  requester_phone: string | null;
  message: string | null;
  requested_docs: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

function rowToRequest(row: RequestRow): DocumentRequest {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    requesterName: row.requester_name,
    requesterCompany: row.requester_company,
    requesterEmail: row.requester_email,
    requesterPhone: row.requester_phone,
    message: row.message,
    requestedDocs: JSON.parse(row.requested_docs),
    status: row.status as DocumentRequest["status"],
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    notes: row.notes,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────

export function createDocumentRequest(input: CreateDocumentRequestInput): number {
  const product = getProductById(input.productId);
  if (!product) throw new Error("Product not found");

  const validationError = validateRequestedDocs(input.requestedDocs);
  if (validationError) throw new Error(validationError);

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO document_requests (product_id, requester_name, requester_company, requester_email, requester_phone, message, requested_docs, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    input.productId,
    input.requesterName,
    input.requesterCompany,
    input.requesterEmail,
    input.requesterPhone || null,
    input.message || null,
    JSON.stringify(input.requestedDocs),
    new Date().toISOString(),
  );

  return Number(result.lastInsertRowid);
}

export function getDocumentRequests(filters?: {
  status?: string;
  productId?: string;
}): DocumentRequest[] {
  const db = getDb();
  let sql = `
    SELECT dr.*, p.product AS product_name
    FROM document_requests dr
    LEFT JOIN products p ON dr.product_id = p.id
  `;
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters?.status) {
    conditions.push("dr.status = ?");
    params.push(filters.status);
  }
  if (filters?.productId) {
    conditions.push("dr.product_id = ?");
    params.push(filters.productId);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY dr.created_at DESC";

  const rows = db.prepare(sql).all(...params) as RequestRow[];
  return rows.map(rowToRequest);
}

export function getDocumentRequestById(id: number): DocumentRequest | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT dr.*, p.product AS product_name
    FROM document_requests dr
    LEFT JOIN products p ON dr.product_id = p.id
    WHERE dr.id = ?
  `).get(id) as RequestRow | undefined;

  return row ? rowToRequest(row) : null;
}

export function updateDocumentRequestStatus(
  id: number,
  status: "approved" | "rejected" | "sent",
  reviewedBy: string,
  notes?: string,
): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE document_requests
    SET status = ?, reviewed_at = ?, reviewed_by = ?, notes = ?
    WHERE id = ?
  `).run(status, new Date().toISOString(), reviewedBy, notes || null, id);

  return result.changes > 0;
}

export function getRecentRequestCount(email: string, windowMinutes: number = 60): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM document_requests
    WHERE requester_email = ? AND created_at > ?
  `).get(email, cutoff) as { cnt: number };
  return row.cnt;
}

export function getPendingRequestCount(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS cnt FROM document_requests WHERE status = 'pending'`).get() as { cnt: number };
  return row.cnt;
}
