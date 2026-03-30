/**
 * POST /api/backfill-coa — Trigger COA data backfill on production.
 *
 * Requires reviewer role. Reads COA files from disk, extracts parameters
 * via Claude Haiku vision, and upserts to all linked lots missing coa_data.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCoaBackfillDocuments, getCoaBackfillStatus } from "@/lib/agent-db";
import { extractCoaData } from "@/lib/coa-extract";
import { upsertCoaData } from "@/lib/coa-data";
import { getUploadsRoot } from "@/lib/paths";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // allow up to 2 minutes for extraction

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const safeSeg = (s: string) => s.replace(/[/\\?%*<>"\x00-\x1f]/g, "_");

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = getCoaBackfillStatus();
  if (status.totalDocuments === 0) {
    return NextResponse.json({
      message: "Nothing to backfill — all COA documents already have extracted data.",
      processed: 0,
      succeeded: 0,
      failed: 0,
      lotsUpdated: 0,
    });
  }

  const docs = getCoaBackfillDocuments();
  const uploadsRoot = resolve(getUploadsRoot());
  const results: Array<{ filename: string; status: string; lots?: number; error?: string }> = [];

  let succeeded = 0;
  let failed = 0;
  let totalLots = 0;

  for (const doc of docs) {
    const filePath = join(
      uploadsRoot,
      safeSeg(doc.productId),
      "lots",
      safeSeg(doc.lotNumber),
      "coa",
      safeSeg(doc.filename),
    );

    // Path traversal guard
    if (!resolve(filePath).startsWith(uploadsRoot + "/")) {
      results.push({ filename: doc.filename, status: "skipped", error: "invalid path" });
      failed++;
      continue;
    }

    if (!existsSync(filePath)) {
      results.push({ filename: doc.filename, status: "skipped", error: "file not found" });
      failed++;
      continue;
    }

    try {
      const buffer = readFileSync(filePath);
      const dotIdx = doc.filename.lastIndexOf(".");
      const ext = dotIdx >= 0 ? doc.filename.substring(dotIdx).toLowerCase() : "";
      const mimeType = MIME_MAP[ext] ?? "application/pdf";

      const fields = await extractCoaData(buffer, mimeType);

      if (!fields) {
        results.push({ filename: doc.filename, status: "failed", error: "no data extracted" });
        failed++;
        continue;
      }

      for (const lot of doc.lots) {
        upsertCoaData(lot.lotId, fields, "backfill");
      }

      results.push({ filename: doc.filename, status: "ok", lots: doc.lots.length });
      succeeded++;
      totalLots += doc.lots.length;
    } catch (err) {
      console.error(`Backfill extraction failed for ${doc.filename}:`, err);
      results.push({ filename: doc.filename, status: "failed", error: "extraction failed" });
      failed++;
    }
  }

  return NextResponse.json({
    message: `Backfill complete: ${succeeded} succeeded, ${failed} failed, ${totalLots} lots updated`,
    processed: docs.length,
    succeeded,
    failed,
    lotsUpdated: totalLots,
    results,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = getCoaBackfillStatus();
  return NextResponse.json(status);
}
