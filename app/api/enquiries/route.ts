import { NextRequest, NextResponse } from "next/server";
import {
  createDocumentRequest,
  getRecentRequestCount,
} from "@/lib/document-requests";
import type { CreateDocumentRequestInput } from "@/lib/document-requests";
import { checkEnquiryRateLimit } from "@/lib/enquiry-rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * POST — Public endpoint for product enquiries.
 * Always sends a sales notification. Optionally creates a document request for QA.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    productId,
    productName,
    requesterName,
    requesterCompany,
    requesterEmail,
    requesterPhone,
    message,
    requestedDocs,
  } = body;

  // Validate required fields
  if (
    typeof requesterName !== "string" ||
    requesterName.trim().length === 0 ||
    requesterName.length > 200
  ) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (
    typeof requesterCompany !== "string" ||
    requesterCompany.trim().length === 0 ||
    requesterCompany.length > 200
  ) {
    return NextResponse.json(
      { error: "Company is required" },
      { status: 400 }
    );
  }
  if (
    typeof requesterEmail !== "string" ||
    !EMAIL_REGEX.test(requesterEmail) ||
    requesterEmail.length > 254
  ) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    );
  }
  if (
    typeof productName !== "string" ||
    productName.trim().length === 0 ||
    productName.length > 300
  ) {
    return NextResponse.json(
      { error: "Product name is required" },
      { status: 400 }
    );
  }
  if (
    requesterPhone !== undefined &&
    requesterPhone !== null &&
    (typeof requesterPhone !== "string" || requesterPhone.length > 30)
  ) {
    return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  }
  if (
    message !== undefined &&
    message !== null &&
    (typeof message !== "string" || message.length > 2000)
  ) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }
  if (
    productId !== undefined &&
    productId !== null &&
    (typeof productId !== "string" || productId.length > 200)
  ) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  const hasDocRequest =
    Array.isArray(requestedDocs) && requestedDocs.length > 0;

  if (hasDocRequest && requestedDocs.length > 100) {
    return NextResponse.json(
      { error: "Too many document items" },
      { status: 400 }
    );
  }

  // Validate each requestedDocs item structure
  const VALID_DOC_CATEGORIES = new Set(["coa", "test-results", "specs"]);
  if (hasDocRequest) {
    for (const item of requestedDocs) {
      if (typeof item !== "object" || item === null) {
        return NextResponse.json({ error: "Invalid document item" }, { status: 400 });
      }
      if (!item.lotNumber && !item.baseContract) {
        return NextResponse.json({ error: "Each item must have lotNumber or baseContract" }, { status: 400 });
      }
      if (item.lotNumber && (typeof item.lotNumber !== "string" || item.lotNumber.length > 100)) {
        return NextResponse.json({ error: "Invalid lot number" }, { status: 400 });
      }
      if (item.baseContract && (typeof item.baseContract !== "string" || item.baseContract.length > 100)) {
        return NextResponse.json({ error: "Invalid contract number" }, { status: 400 });
      }
      if (!Array.isArray(item.categories) || item.categories.length === 0) {
        return NextResponse.json({ error: "Each item must have categories" }, { status: 400 });
      }
      for (const cat of item.categories) {
        if (!VALID_DOC_CATEGORIES.has(cat)) {
          return NextResponse.json({ error: "Invalid document category" }, { status: 400 });
        }
      }
    }
  }

  // Rate limit: check both in-memory (all enquiries) and DB (doc requests)
  const emailLower = (requesterEmail as string).trim().toLowerCase();
  const rateCheck = checkEnquiryRateLimit(emailLower);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter: rateCheck.retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfter) },
      }
    );
  }
  if (hasDocRequest) {
    const recentDocRequests = getRecentRequestCount(emailLower);
    if (recentDocRequests >= 5) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  }

  try {
    const cleanName = (requesterName as string).trim();
    const cleanCompany = (requesterCompany as string).trim();
    const cleanPhone = requesterPhone
      ? String(requesterPhone).trim()
      : undefined;
    const cleanMessage = message ? String(message).trim() : undefined;
    const cleanProductName = (productName as string).trim();

    // Always send sales notification (fire-and-forget)
    import("@/lib/document-request-emails").then(
      ({ sendSalesNotification }) => {
        sendSalesNotification({
          productName: cleanProductName,
          requesterName: cleanName,
          requesterCompany: cleanCompany,
          requesterEmail: emailLower,
          requesterPhone: cleanPhone,
          message: cleanMessage,
          hasDocumentRequest: hasDocRequest,
        }).catch((err) => {
          console.error("Failed to send sales notification:", err);
        });
      }
    );

    // If documents requested and productId provided, create document request + notify QA
    let documentRequestId: number | undefined;
    if (hasDocRequest && productId) {
      const input: CreateDocumentRequestInput = {
        productId: productId as string,
        requesterName: cleanName,
        requesterCompany: cleanCompany,
        requesterEmail: emailLower,
        requesterPhone: cleanPhone,
        message: cleanMessage,
        requestedDocs:
          requestedDocs as CreateDocumentRequestInput["requestedDocs"],
      };

      documentRequestId = createDocumentRequest(input);

      import("@/lib/document-request-emails").then(
        ({ sendRequestNotification }) => {
          sendRequestNotification(documentRequestId!).catch((err) => {
            console.error(
              "Failed to send document request notification:",
              err
            );
          });
        }
      );
    }

    return NextResponse.json(
      { success: true, documentRequestId },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit";
    if (msg === "Product not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Enquiry submission error:", err);
    return NextResponse.json(
      { error: "Failed to submit enquiry" },
      { status: 400 }
    );
  }
}
