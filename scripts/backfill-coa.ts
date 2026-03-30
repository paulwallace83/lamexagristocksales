/**
 * scripts/backfill-coa.ts — Re-extract COA key aspects from uploaded files.
 *
 * Finds all COA documents that have linked lots but no extracted coa_data,
 * reads each file from disk, sends it to Claude Haiku vision for extraction,
 * and upserts the results. Document-centric: extracts once per unique file,
 * upserts to all linked lots.
 *
 * Usage:
 *   npm run backfill-coa                  # process all (up to 50 documents)
 *   railway run npm run backfill-coa      # run on Railway production
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */

import { getCoaBackfillDocuments, getCoaBackfillStatus } from "../lib/agent-db";
import { extractCoaData } from "../lib/coa-extract";
import { upsertCoaData } from "../lib/coa-data";
import { getUploadsRoot } from "../lib/paths";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const safeSeg = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

async function main() {
  // Show status first
  const status = getCoaBackfillStatus();
  console.log(`COA Backfill Status:`);
  console.log(`  Documents needing extraction: ${status.totalDocuments}`);
  console.log(`  Lots missing COA data: ${status.totalLots}`);
  console.log(`  Products affected: ${status.productCount}`);
  console.log();

  if (status.totalDocuments === 0) {
    console.log("Nothing to backfill — all COA documents already have extracted data.");
    return;
  }

  for (const p of status.products) {
    const lotCount = p.documents.reduce((n, d) => n + d.lots.length, 0);
    console.log(`  ${p.product} — ${p.documents.length} doc(s), ${lotCount} lot(s)`);
  }
  console.log();

  // Process documents
  const docs = getCoaBackfillDocuments();
  const uploadsRoot = resolve(getUploadsRoot());
  console.log(`Processing ${docs.length} documents...\n`);

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
    if (!resolve(filePath).startsWith(uploadsRoot)) {
      console.log(`SKIP ${doc.filename} — invalid path`);
      failed++;
      continue;
    }

    if (!existsSync(filePath)) {
      console.log(`SKIP ${doc.filename} — file not found on disk`);
      failed++;
      continue;
    }

    try {
      const buffer = readFileSync(filePath);
      const dotIdx = doc.filename.lastIndexOf(".");
      const ext = dotIdx >= 0 ? doc.filename.substring(dotIdx).toLowerCase() : "";
      const mimeType = MIME_MAP[ext] ?? "application/pdf";

      console.log(`Extracting: ${doc.filename}...`);
      const fields = await extractCoaData(buffer, mimeType);

      if (!fields) {
        console.log(`  FAIL — no data extracted\n`);
        failed++;
        continue;
      }

      for (const lot of doc.lots) {
        upsertCoaData(lot.lotId, fields, "backfill");
      }

      const keys = Object.entries(fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      console.log(`  OK — ${doc.lots.length} lot(s) updated: ${keys}\n`);
      succeeded++;
      totalLots += doc.lots.length;
    } catch (err) {
      console.error(`  FAIL — ${err instanceof Error ? err.message : "Unknown error"}\n`);
      failed++;
    }
  }

  console.log("---");
  console.log(`Done: ${succeeded} succeeded, ${failed} failed, ${totalLots} lots updated`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
