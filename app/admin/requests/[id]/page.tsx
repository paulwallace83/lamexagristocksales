import { notFound } from "next/navigation";
import Link from "next/link";
import { getDocumentRequestById } from "@/lib/document-requests";
import { getDocumentsForProduct } from "@/lib/documents";
import ReviewFormClient from "./ReviewFormClient";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  sent: "bg-emerald-100 text-emerald-800",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const request = getDocumentRequestById(numId);
  if (!request) notFound();

  // Get actual documents to check availability
  const documents = getDocumentsForProduct(request.productId);

  // Check which requested items have actual files
  const docAvailability = request.requestedDocs.map((item) => {
    const available: string[] = [];
    const missing: string[] = [];

    for (const cat of item.categories) {
      let found = false;
      if (item.lotNumber) {
        found = documents.some((d) => d.category === cat && d.lotNumbers.includes(item.lotNumber!));
      } else if (item.baseContract) {
        found = documents.some((d) => d.category === cat && d.baseContract === item.baseContract);
      }
      if (found) available.push(cat);
      else missing.push(cat);
    }

    return { ...item, available, missing };
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/admin/requests" className="hover:text-[#4a90c4] transition-colors">Requests</Link>
        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 font-medium">#{request.id}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: request details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#1a2b5f] to-[#243f75] px-6 py-4 flex items-center justify-between">
              <h1 className="text-lg font-bold text-white">{request.productName}</h1>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_STYLES[request.status]}`}>
                {request.status}
              </span>
            </div>

            <div className="p-6 space-y-4">
              {/* Requester info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Name</p>
                  <p className="text-gray-900">{request.requesterName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Company</p>
                  <p className="text-gray-900">{request.requesterCompany}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                  <a href={`mailto:${request.requesterEmail}`} className="text-[#4a90c4] hover:underline">
                    {request.requesterEmail}
                  </a>
                </div>
                {request.requesterPhone && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Phone</p>
                    <p className="text-gray-900">{request.requesterPhone}</p>
                  </div>
                )}
              </div>

              {/* Message */}
              {request.message && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Message</p>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {request.message}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
                <span>Submitted: {formatDate(request.createdAt)}</span>
                {request.reviewedAt && <span>Reviewed: {formatDate(request.reviewedAt)}</span>}
                {request.reviewedBy && <span>By: {request.reviewedBy}</span>}
              </div>

              {/* Review notes */}
              {request.notes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Reviewer Notes</p>
                  <p className="text-sm text-blue-800">{request.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: docs + action */}
        <div className="space-y-6">
          {/* Requested documents */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Requested Documents</h2>
            <div className="space-y-3">
              {docAvailability.map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="font-mono text-xs font-bold text-[#1a2b5f] mb-1">
                    {item.lotNumber ? `Lot ${item.lotNumber}` : `Contract ${item.baseContract}`}
                  </p>
                  <div className="space-y-1">
                    {item.available.map((cat) => (
                      <div key={cat} className="flex items-center gap-1.5 text-xs">
                        <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-700">{cat.toUpperCase()}</span>
                        <span className="text-emerald-600 text-[10px]">ready</span>
                      </div>
                    ))}
                    {item.missing.map((cat) => (
                      <div key={cat} className="flex items-center gap-1.5 text-xs">
                        <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-500">{cat.toUpperCase()}</span>
                        <span className="text-red-500 text-[10px]">not uploaded</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Review form (pending only) */}
          {request.status === "pending" && (
            <ReviewFormClient requestId={request.id} />
          )}

          {/* Product link */}
          <Link
            href={`/product/${request.productId}`}
            className="block text-center text-sm text-[#4a90c4] hover:underline"
          >
            View Product Page
          </Link>
        </div>
      </div>
    </div>
  );
}
