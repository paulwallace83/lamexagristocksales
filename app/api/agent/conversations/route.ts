import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getConversations,
  createConversation,
  generateTitle,
} from "@/lib/conversations";

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

export async function GET() {
  const user = await requireAgent();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = getConversations(user.email!);
  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const user = await requireAgent();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title = "New conversation";
  try {
    const body = await req.json();
    if (body.title) {
      title = generateTitle(body.title);
    }
  } catch {
    // Empty body is fine — use default title
  }

  const conversation = createConversation(user.email!, title);
  return NextResponse.json(conversation, { status: 201 });
}
