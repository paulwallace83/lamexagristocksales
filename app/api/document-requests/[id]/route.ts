import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDocumentRequestById,
  updateDocumentRequestStatus,
} from "@/lib/document-requests";
import { getDocumentsForProduct, getUploadDir } from "@/lib/documents";
import { sendApprovalEmail } from "@/lib/document-request-emails";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * GET — Auth-protected: fetch a single document request by ID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.role || !["qa", "reviewer"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const request = getDocumentRequestById(numId);
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(request);
}

/**
 * PATCH — Auth-protected: approve or reject a document request.
 * On approve, gathers files and emails them to the customer.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.role || !["qa", "reviewer"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, notes } = body;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) {
    return NextResponse.json({ error: "Notes too long" }, { status: 400 });
  }

  const request = getDocumentRequestById(numId);
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${request.status}` }, { status: 400 });
  }

  const reviewedBy = session.user.email ?? "unknown";

  if (status === "rejected") {
    updateDocumentRequestStatus(numId, "rejected", reviewedBy, notes as string | undefined);
    return NextResponse.json({ success: true, status: "rejected" });
  }

  // Approved — gather files and send to customer
  updateDocumentRequestStatus(numId, "approved", reviewedBy, notes as string | undefined);

  try {
    const documents = getDocumentsForProduct(request.productId);
    const attachments: Array<{ filename: string; content: Buffer }> = [];

    for (const item of request.requestedDocs) {
      for (const category of item.categories) {
        let matchingDocs;
        if (item.lotNumber) {
          // Lot-level docs (COA, test-results)
          matchingDocs = documents.filter(
            (d) =>
              d.category === category &&
              d.lotNumbers.includes(item.lotNumber!)
          );
        } else if (item.baseContract) {
          // Contract-level docs (specs)
          matchingDocs = documents.filter(
            (d) =>
              d.category === category &&
              d.baseContract === item.baseContract
          );
        } else {
          continue;
        }

        for (const doc of matchingDocs) {
          const dir = getUploadDir(
            request.productId,
            category,
            item.lotNumber
              ? { lotNumber: item.lotNumber }
              : { baseContract: item.baseContract }
          );
          const filepath = join(dir, doc.filename);
          if (existsSync(filepath)) {
            try {
              attachments.push({
                filename: doc.originalName,
                content: readFileSync(filepath),
              });
            } catch (readErr) {
              console.warn(`[document-requests] Could not read file ${filepath}:`, readErr);
              // Skip this file — continue building attachments from remaining docs
            }
          }
        }
      }
    }

    if (attachments.length === 0) {
      return NextResponse.json({
        success: true,
        status: "approved",
        warning: "No files found to send. Request approved but no email sent.",
      });
    }

    const result = await sendApprovalEmail(
      { ...request, notes: (notes as string) || request.notes },
      attachments
    );

    if (result.success) {
      updateDocumentRequestStatus(numId, "sent", reviewedBy);
      return NextResponse.json({ success: true, status: "sent" });
    } else {
      return NextResponse.json({
        success: true,
        status: "approved",
        warning: `Approved but email failed: ${result.error}. You can retry.`,
      });
    }
  } catch (err) {
    console.error("Error sending approval email:", err);
    return NextResponse.json({
      success: true,
      status: "approved",
      warning: "Approved but email delivery failed. You can retry.",
    });
  }
}
