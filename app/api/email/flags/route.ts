import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getFlags, toggleFlag, type FlagType } from "@/lib/product-flags";

export const dynamic = "force-dynamic";

const VALID_FLAGS: FlagType[] = ["new_arrival", "featured"];

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = getFlags();
  return NextResponse.json({ flags });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, flag } = body as { productId?: string; flag?: string };

  if (
    !productId ||
    typeof productId !== "string" ||
    productId.length > 200 ||
    /[<>"';&\\]/.test(productId)
  ) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }
  if (!flag || !VALID_FLAGS.includes(flag as FlagType)) {
    return NextResponse.json({ error: "Invalid flag — must be 'new_arrival' or 'featured'" }, { status: 400 });
  }

  const isNowSet = toggleFlag(productId, flag as FlagType, session.user.email ?? "admin");
  return NextResponse.json({ productId, flag, active: isNowSet });
}
