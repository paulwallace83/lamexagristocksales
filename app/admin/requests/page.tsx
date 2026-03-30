import Link from "next/link";
import { getDocumentRequests, getPendingRequestCount } from "@/lib/document-requests";
import RequestsListClient from "./RequestsListClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = getDocumentRequests();
  const pendingCount = getPendingRequestCount();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve customer requests for COAs, test results, and spec sheets.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500">No document requests yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Requests will appear here when customers request documents via the product enquiry form.
          </p>
        </div>
      ) : (
        <RequestsListClient requests={requests} />
      )}
    </div>
  );
}
