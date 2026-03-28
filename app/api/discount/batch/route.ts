import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  addDiscountItemsFromLots,
  type DiscountReason,
} from "@/lib/discount";

export const dynamic = "force-dynamic";

const VALID_REASONS: DiscountReason[] = [
  "insurance-claim",
  "expired",
  "overstock",
  "damaged",
  "other",
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }

  if (body.items.length > 50) {
    return NextResponse.json({ error: "Maximum 50 items per batch" }, { status: 400 });
  }

  // Check for duplicate lot numbers within the batch
  const lotKeys = new Set<string>();
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i] as Record<string, unknown>;
    const key = `${item.productId}:${item.lotNumber}`;
    if (lotKeys.has(key)) {
      return NextResponse.json(
        { error: `Duplicate lot in batch: item ${i} has the same productId + lotNumber as an earlier item` },
        { status: 400 },
      );
    }
    lotKeys.add(key);
  }

  // Validate each item
  const validated: Array<{
    productId: string;
    lotNumber: string;
    reason: DiscountReason;
    notes: string | null;
    askingPrice: string | null;
  }> = [];

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i] as Record<string, unknown>;

    if (typeof item.productId !== "string" || !item.productId) {
      return NextResponse.json({ error: `Item ${i}: productId is required` }, { status: 400 });
    }
    if (typeof item.lotNumber !== "string" || !item.lotNumber) {
      return NextResponse.json({ error: `Item ${i}: lotNumber is required` }, { status: 400 });
    }
    if (!VALID_REASONS.includes(item.reason as DiscountReason)) {
      return NextResponse.json(
        { error: `Item ${i}: reason must be one of: ${VALID_REASONS.join(", ")}` },
        { status: 400 },
      );
    }
    if (item.notes !== undefined && item.notes !== null && typeof item.notes !== "string") {
      return NextResponse.json({ error: `Item ${i}: notes must be a string` }, { status: 400 });
    }
    if (item.notes && (item.notes as string).length > 1000) {
      return NextResponse.json({ error: `Item ${i}: notes exceeds 1000 characters` }, { status: 400 });
    }
    if (item.askingPrice !== undefined && item.askingPrice !== null && typeof item.askingPrice !== "string") {
      return NextResponse.json({ error: `Item ${i}: askingPrice must be a string` }, { status: 400 });
    }
    if (item.askingPrice && (item.askingPrice as string).length > 100) {
      return NextResponse.json({ error: `Item ${i}: askingPrice exceeds 100 characters` }, { status: 400 });
    }

    validated.push({
      productId: item.productId,
      lotNumber: item.lotNumber,
      reason: item.reason as DiscountReason,
      notes: typeof item.notes === "string" ? item.notes.trim() : null,
      askingPrice: typeof item.askingPrice === "string" ? item.askingPrice.trim() : null,
    });
  }

  try {
    const created = addDiscountItemsFromLots(validated);
    return NextResponse.json({
      message: `Created ${created.length} discount item(s)`,
      items: created,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
