/**
 * /api/coa-review — COA extraction review endpoint (B010)
 *
 * GET  ?productId=xxx — returns COA data for a product's lots with review status
 * POST { lotIds, action: 'approve' | 'reject' } — bulk review action
 *
 * Auth: `qa` or `reviewer` role. Unauthenticated requests return 404 (not 403)
 * to avoid revealing endpoint existence.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getCoaReviewQueue,
  reviewCoaData,
  formatCoaFields,
} from "@/lib/coa-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId") || undefined;

  const queue = getCoaReviewQueue(productId);
  const items = queue.map((r) => ({
    lotId: r.lotId,
    lotNumber: r.lotNumber,
    productId: r.productId,
    productName: r.productName,
    reviewStatus: r.reviewStatus,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
    reviewedAt: r.reviewedAt,
    reviewedBy: r.reviewedBy,
    fields: formatCoaFields(r.fields),
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "qa" && session.user.role !== "reviewer")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const { lotIds, action } = body as { lotIds?: unknown; action?: unknown };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  if (!Array.isArray(lotIds) || lotIds.length === 0) {
    return NextResponse.json({ error: "lotIds must be a non-empty array" }, { status: 400 });
  }

  if (lotIds.length > 500) {
    return NextResponse.json({ error: "lotIds array exceeds maximum of 500" }, { status: 400 });
  }

  const reviewedBy = session.user.email || "unknown";
  let updated = 0;
  let skipped = 0;

  for (const raw of lotIds) {
    const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(id) || id <= 0) {
      skipped++;
      continue;
    }
    const ok = reviewCoaData(id, action, reviewedBy);
    if (ok) updated++;
    else skipped++;
  }

  return NextResponse.json({ updated, skipped, action });
}
