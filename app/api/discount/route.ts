import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  getDiscountItems,
  addDiscountItem,
  type DiscountItemInput,
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

const MAX_STRING_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;

/** Validate that a string is a real calendar date in YYYY-MM-DD format. */
function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = getDiscountItems("active");
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields exist and are strings
  const requiredStrings = [
    "product",
    "commodity",
    "category",
    "format",
    "warehouse",
    "city",
    "state",
    "supplier",
    "countryOfOrigin",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return NextResponse.json(
        { error: `Missing or invalid required field: ${field}` },
        { status: 400 },
      );
    }
    if ((body[field] as string).length > MAX_STRING_LENGTH) {
      return NextResponse.json(
        { error: `${field} exceeds maximum length of ${MAX_STRING_LENGTH}` },
        { status: 400 },
      );
    }
  }

  // Validate reason
  if (!VALID_REASONS.includes(body.reason as DiscountReason)) {
    return NextResponse.json(
      { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate numeric fields — must be actual numbers, not strings
  if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
  }
  if (typeof body.weightLbs !== "number" || !Number.isFinite(body.weightLbs) || body.weightLbs <= 0) {
    return NextResponse.json({ error: "weightLbs must be a positive number" }, { status: 400 });
  }

  // Validate optional string fields
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json(
        { error: `notes must be a string under ${MAX_NOTES_LENGTH} characters` },
        { status: 400 },
      );
    }
  }
  if (body.askingPrice !== undefined && body.askingPrice !== null) {
    if (typeof body.askingPrice !== "string" || body.askingPrice.length > 100) {
      return NextResponse.json({ error: "askingPrice must be a string under 100 characters" }, { status: 400 });
    }
  }
  if (body.lotNumber !== undefined && body.lotNumber !== null) {
    if (typeof body.lotNumber !== "string" || body.lotNumber.length > 100) {
      return NextResponse.json({ error: "lotNumber must be a string under 100 characters" }, { status: 400 });
    }
  }

  // Validate contracts array
  let contracts: string[] = [];
  if (Array.isArray(body.contracts)) {
    for (const c of body.contracts) {
      if (typeof c !== "string" || c.length > 50) {
        return NextResponse.json({ error: "Each contract must be a string under 50 characters" }, { status: 400 });
      }
    }
    contracts = body.contracts.map(String);
  }

  const input: DiscountItemInput = {
    productId: typeof body.productId === "string" && body.productId.length <= 200 ? body.productId : null,
    product: String(body.product).trim(),
    commodity: String(body.commodity).trim(),
    category: String(body.category).trim(),
    format: String(body.format).trim(),
    organic: body.organic === true,
    packSize: typeof body.packSize === "string" ? body.packSize.trim().slice(0, MAX_STRING_LENGTH) : "",
    unitType: typeof body.unitType === "string" ? body.unitType.trim().slice(0, 50) : "cases",
    warehouse: String(body.warehouse).trim(),
    city: String(body.city).trim(),
    state: String(body.state).trim(),
    supplier: String(body.supplier).trim(),
    countryOfOrigin: String(body.countryOfOrigin).trim(),
    quantity: body.quantity as number,
    weightLbs: body.weightLbs as number,
    lotNumber: typeof body.lotNumber === "string" ? body.lotNumber.trim() : null,
    contracts,
    bbd: typeof body.bbd === "string" && isValidIsoDate(body.bbd) ? body.bbd : null,
    reason: body.reason as DiscountReason,
    notes: typeof body.notes === "string" ? body.notes.trim() : null,
    askingPrice: typeof body.askingPrice === "string" ? body.askingPrice.trim() : null,
  };

  const item = addDiscountItem(input);
  return NextResponse.json({ item }, { status: 201 });
}
