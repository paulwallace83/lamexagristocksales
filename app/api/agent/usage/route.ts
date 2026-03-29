import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageStats } from "@/lib/api-usage";

export async function GET() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "qa" && session.user.role !== "reviewer")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = getUsageStats();
  return NextResponse.json(stats);
}
