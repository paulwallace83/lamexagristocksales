import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createDocumentRequest,
  getDocumentRequests,
  getRecentRequestCount,
} from "@/lib/document-requests";
import type { CreateDocumentRequestInput } from "@/lib/document-requests";

export const dynamic = "force-dynamic";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * POST — Public endpoint for customers to submit a document request.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, requesterName, requesterCompany, requesterEmail, requesterPhone, message, requestedDocs } = body;

  // Validate required fields
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 200) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }
  if (typeof requesterName !== "string" || requesterName.trim().length === 0 || requesterName.length > 200) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof requesterCompany !== "string" || requesterCompany.trim().length === 0 || requesterCompany.length > 200) {
    return NextResponse.json({ error: "Company is required" }, { status: 400 });
  }
  if (typeof requesterEmail !== "string" || !EMAIL_REGEX.test(requesterEmail) || requesterEmail.length > 254) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (requesterPhone !== undefined && requesterPhone !== null && (typeof requesterPhone !== "string" || requesterPhone.length > 30)) {
    return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  }
  if (message !== undefined && message !== null && (typeof message !== "string" || message.length > 2000)) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }
  if (!Array.isArray(requestedDocs) || requestedDocs.length === 0 || requestedDocs.length > 100) {
    return NextResponse.json({ error: "requestedDocs is required" }, { status: 400 });
  }

  // Rate limit: 5 per email per hour
  const recent = getRecentRequestCount(requesterEmail.toLowerCase());
  if (recent >= 5) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const input: CreateDocumentRequestInput = {
      productId: productId as string,
      requesterName: (requesterName as string).trim(),
      requesterCompany: (requesterCompany as string).trim(),
      requesterEmail: (requesterEmail as string).trim().toLowerCase(),
      requesterPhone: requesterPhone ? String(requesterPhone).trim() : undefined,
      message: message ? String(message).trim() : undefined,
      requestedDocs: requestedDocs as CreateDocumentRequestInput["requestedDocs"],
    };

    const id = createDocumentRequest(input);

    // Fire-and-forget notification email (import dynamically to avoid loading Resend on every request)
    import("@/lib/document-request-emails").then(({ sendRequestNotification }) => {
      sendRequestNotification(id).catch((err) => {
        console.error("Failed to send document request notification:", err);
      });
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create request";
    if (msg === "Product not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Document request creation error:", err);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 400 });
  }
}

/**
 * GET — Auth-protected endpoint to list document requests (for QA/reviewer).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.role || !["qa", "reviewer"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const productId = url.searchParams.get("productId") || undefined;

  const requests = getDocumentRequests({ status, productId });
  return NextResponse.json(requests);
}
