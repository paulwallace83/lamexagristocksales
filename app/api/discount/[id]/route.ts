import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  getDiscountItem,
  updateDiscountItem,
  removeDiscountItem,
  restoreToInventory,
  type DiscountReason,
  type DiscountStatus,
} from "@/lib/discount";

export const dynamic = "force-dynamic";

const VALID_REASONS: DiscountReason[] = [
  "insurance-claim",
  "expired",
  "overstock",
  "damaged",
  "other",
];

const VALID_STATUSES: DiscountStatus[] = ["active", "sold", "missing"];

const MAX_STRING_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;

function validateId(id: string): boolean {
  return /^disc-\d{1,6}$/.test(id);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!validateId(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const item = getDiscountItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!validateId(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Restore to regular inventory — permanently removes the discount item
  if (body.action === "restore") {
    const success = restoreToInventory(id);
    if (!success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Item restored to regular inventory. Run sync or seed to apply." });
  }

  // Build validated update object — only allow known fields
  const updates: Record<string, unknown> = {};

  // String fields with length limits
  const stringFields: Array<[string, number]> = [
    ["product", MAX_STRING_LENGTH],
    ["commodity", MAX_STRING_LENGTH],
    ["category", MAX_STRING_LENGTH],
    ["format", MAX_STRING_LENGTH],
    ["packSize", MAX_STRING_LENGTH],
    ["unitType", 50],
    ["warehouse", MAX_STRING_LENGTH],
    ["city", MAX_STRING_LENGTH],
    ["state", MAX_STRING_LENGTH],
    ["supplier", MAX_STRING_LENGTH],
    ["countryOfOrigin", MAX_STRING_LENGTH],
    ["lotNumber", 100],
    ["askingPrice", 100],
    ["productId", 200],
  ];

  for (const [field, maxLen] of stringFields) {
    if (body[field] !== undefined) {
      if (body[field] !== null && (typeof body[field] !== "string" || (body[field] as string).length > maxLen)) {
        return NextResponse.json(
          { error: `${field} must be a string under ${maxLen} characters` },
          { status: 400 },
        );
      }
      updates[field] = body[field];
    }
  }

  // Notes with higher limit
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== "string" || (body.notes as string).length > MAX_NOTES_LENGTH)) {
      return NextResponse.json(
        { error: `notes must be a string under ${MAX_NOTES_LENGTH} characters` },
        { status: 400 },
      );
    }
    updates.notes = body.notes;
  }

  // Numeric fields
  if (body.quantity !== undefined) {
    if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity <= 0) {
      return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
    }
    updates.quantity = body.quantity;
  }
  if (body.weightLbs !== undefined) {
    if (typeof body.weightLbs !== "number" || !Number.isFinite(body.weightLbs) || body.weightLbs <= 0) {
      return NextResponse.json({ error: "weightLbs must be a positive number" }, { status: 400 });
    }
    updates.weightLbs = body.weightLbs;
  }

  // Boolean
  if (body.organic !== undefined) {
    updates.organic = body.organic === true;
  }

  // Enum validation
  if (body.reason !== undefined) {
    if (!VALID_REASONS.includes(body.reason as DiscountReason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` },
        { status: 400 },
      );
    }
    updates.reason = body.reason;
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as DiscountStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  // Date field
  if (body.bbd !== undefined) {
    if (body.bbd !== null && (typeof body.bbd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.bbd))) {
      return NextResponse.json({ error: "bbd must be an ISO date string (YYYY-MM-DD)" }, { status: 400 });
    }
    updates.bbd = body.bbd;
  }

  // Contracts array
  if (body.contracts !== undefined) {
    if (!Array.isArray(body.contracts)) {
      return NextResponse.json({ error: "contracts must be an array" }, { status: 400 });
    }
    for (const c of body.contracts) {
      if (typeof c !== "string" || c.length > 50) {
        return NextResponse.json({ error: "Each contract must be a string under 50 characters" }, { status: 400 });
      }
    }
    updates.contracts = body.contracts;
  }

  // Disallow immutable fields
  if (body.id !== undefined || body.addedDate !== undefined) {
    return NextResponse.json({ error: "Cannot modify id or addedDate" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = updateDiscountItem(id, updates as any);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!validateId(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const success = removeDiscountItem(id);
  if (!success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "Item marked as sold" });
}
