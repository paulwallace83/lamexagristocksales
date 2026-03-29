import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConversation, deleteConversation } from "@/lib/conversations";

async function requireAgent() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "qa" && session.user.role !== "reviewer")
  ) {
    return null;
  }
  return session.user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAgent();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = getConversation(id, user.email!);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(conversation);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAgent();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = deleteConversation(id, user.email!);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
