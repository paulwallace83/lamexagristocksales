/**
 * GET  /api/rename-uploads — Preview which files would be renamed.
 * POST /api/rename-uploads — Execute the rename on disk + update the DB.
 *
 * Requires reviewer role. Runs inside the Railway service container where
 * the persistent volume is mounted, so it has access to uploaded files.
 */

import { NextResponse } from "next/server";
import { existsSync, readdirSync, renameSync } from "fs";
import { join, dirname, resolve } from "path";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUploadsRoot } from "@/lib/paths";
import { generateDocFilename } from "@/lib/documents";
import type { DocCategory } from "@/lib/documents";

export const dynamic = "force-dynamic";

const OLD_FILENAME_RE = /^\d{13,}-/;

interface DocRecord {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  filename: string;
  base_contract: string | null;
  lot_numbers: string | null;
  country_of_origin: string | null;
  uploaded_at: string;
}

interface RenamePreview {
  id: string;
  productId: string;
  category: string;
  currentFilename: string;
  newFilename: string;
  foundOnDisk: boolean;
}

function findFileOnDisk(
  uploadsRoot: string,
  productId: string,
  category: string,
  filename: string,
): string | null {
  const productDir = join(uploadsRoot, productId);
  if (!existsSync(productDir)) return null;
  for (const subtype of ["lots", "contracts"]) {
    const subtypeDir = join(productDir, subtype);
    if (!existsSync(subtypeDir)) continue;
    let entries: string[];
    try { entries = readdirSync(subtypeDir); } catch { continue; }
    for (const sub of entries) {
      const filepath = join(subtypeDir, sub, category, filename);
      if (existsSync(filepath)) return filepath;
    }
  }
  return null;
}

function identifierFromPath(filepath: string): string | null {
  const parts = filepath.replace(/\\/g, "/").split("/");
  const lotsIdx = parts.lastIndexOf("lots");
  if (lotsIdx >= 0 && parts[lotsIdx + 1]) return parts[lotsIdx + 1];
  const contractsIdx = parts.lastIndexOf("contracts");
  if (contractsIdx >= 0 && parts[contractsIdx + 1]) return parts[contractsIdx + 1];
  return null;
}

function queryDocs(): DocRecord[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      d.id,
      d.product_id,
      p.product        AS product_name,
      d.category,
      d.filename,
      d.base_contract,
      d.lot_numbers,
      COALESCE(li.country_of_origin, di.country_of_origin) AS country_of_origin,
      d.uploaded_at
    FROM documents d
    JOIN products p ON d.product_id = p.id
    LEFT JOIN (
      SELECT product_id, country_of_origin FROM listings GROUP BY product_id
    ) li ON li.product_id = d.product_id
    LEFT JOIN (
      SELECT product_id, country_of_origin FROM discount_items
      WHERE status = 'active' AND product_id IS NOT NULL GROUP BY product_id
    ) di ON di.product_id = d.product_id
  `).all() as DocRecord[];
}

function buildPreviews(docs: DocRecord[], uploadsRoot: string): RenamePreview[] {
  const toRename = docs.filter((d) => OLD_FILENAME_RE.test(d.filename));
  const previews: RenamePreview[] = [];

  for (const doc of toRename) {
    const cat = doc.category as DocCategory;
    const currentPath = findFileOnDisk(uploadsRoot, doc.product_id, cat, doc.filename);
    const fileDir = currentPath ? dirname(currentPath) : null;
    const storageId = currentPath ? identifierFromPath(currentPath) : null;
    const isLotLevel = ["coa", "test-results"].includes(cat);

    const newFilename = fileDir
      ? generateDocFilename({
          category: cat,
          productName: doc.product_name,
          originalName: doc.filename,
          documentDate: doc.uploaded_at.slice(0, 10),
          lotNumber: isLotLevel ? (storageId ?? undefined) : undefined,
          baseContract: !isLotLevel ? (doc.base_contract ?? storageId ?? undefined) : undefined,
          countryOfOrigin: doc.country_of_origin ?? undefined,
          targetDir: fileDir,
        })
      : "(file not found on disk)";

    previews.push({
      id: doc.id,
      productId: doc.product_id,
      category: cat,
      currentFilename: doc.filename,
      newFilename,
      foundOnDisk: !!currentPath,
    });
  }

  return previews;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadsRoot = resolve(getUploadsRoot());
  const docs = queryDocs();
  const toRename = docs.filter((d) => OLD_FILENAME_RE.test(d.filename));
  const previews = buildPreviews(docs, uploadsRoot);

  return NextResponse.json({
    total: docs.length,
    alreadyRenamed: docs.length - toRename.length,
    toRename: previews.length,
    previews,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadsRoot = resolve(getUploadsRoot());
  const docs = queryDocs();
  const previews = buildPreviews(docs, uploadsRoot);

  if (previews.length === 0) {
    return NextResponse.json({
      message: "Nothing to rename — all files already use descriptive names.",
      renamed: 0, skipped: 0, failed: 0, results: [],
    });
  }

  const db = getDb();
  const updateFilename = db.prepare("UPDATE documents SET filename = ? WHERE id = ?");

  const results: Array<{ filename: string; newFilename: string; status: string; error?: string }> = [];
  let renamed = 0, skipped = 0, failed = 0;

  for (const preview of previews) {
    if (!preview.foundOnDisk) {
      results.push({ filename: preview.currentFilename, newFilename: preview.newFilename, status: "skipped", error: "file not found on disk" });
      skipped++;
      continue;
    }

    const currentPath = findFileOnDisk(uploadsRoot, preview.productId, preview.category, preview.currentFilename)!;
    const newPath = join(dirname(currentPath), preview.newFilename);

    try {
      renameSync(currentPath, newPath);
      updateFilename.run(preview.newFilename, preview.id);
      results.push({ filename: preview.currentFilename, newFilename: preview.newFilename, status: "ok" });
      renamed++;
    } catch (err) {
      results.push({ filename: preview.currentFilename, newFilename: preview.newFilename, status: "failed", error: err instanceof Error ? err.message : String(err) });
      failed++;
    }
  }

  return NextResponse.json({
    message: `Rename complete: ${renamed} renamed, ${skipped} skipped, ${failed} failed.`,
    renamed, skipped, failed, results,
  });
}
