import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConversation, saveMessages } from "@/lib/conversations";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAgent();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const conversation = getConversation(id, user.email!);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    messages: Array<{
      role: string;
      content: string;
      fileNames?: string[];
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "messages must be an array" },
      { status: 400 }
    );
  }

  // Validate and cap messages
  const MAX_MESSAGES = 200;
  const MAX_CONTENT_LENGTH = 500_000; // 500KB per message
  const VALID_ROLES = new Set(["user", "assistant"]);

  const validated = body.messages.slice(0, MAX_MESSAGES);
  for (const m of validated) {
    if (!VALID_ROLES.has(m.role)) {
      return NextResponse.json({ error: "Invalid message role" }, { status: 400 });
    }
    const contentStr = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (contentStr.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "Message content too large" }, { status: 400 });
    }
  }

  saveMessages(id, validated);
  return NextResponse.json({ ok: true });
}
