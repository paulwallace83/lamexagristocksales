import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDocumentStatus, getCategoryLabel, type DocCategory } from "@/lib/documents";

export const dynamic = "force-dynamic";

export default async function QADashboard() {
  const session = await auth();
  if (!session?.user) redirect("/qa/login");

  const statuses = getDocumentStatus();
  const complete = statuses.filter((s) => s.complete).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Document Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {complete} of {statuses.length} products have all required documents.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white border border-gray-200 rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">COA</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Test Results</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Labels</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Photos</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <tr key={s.productId} className="border-b border-gray-100 hover:bg-blue-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.product}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge count={s.uploaded.coa} required={s.requiredCategories.includes("coa")} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge count={s.uploaded["test-results"]} required={s.requiredCategories.includes("test-results")} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge count={s.uploaded.labels} required={s.requiredCategories.includes("labels")} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge count={s.uploaded.photos} required={s.requiredCategories.includes("photos")} />
                </td>
                <td className="px-4 py-3 text-center">
                  {s.complete ? (
                    <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">Complete</span>
                  ) : (
                    <span className="inline-block bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded">Missing</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    href={`/qa/upload/${s.productId}`}
                    className="inline-block bg-[#1a2b5f] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#4a90c4] transition-colors"
                  >
                    Upload
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ count, required }: { count: number; required: boolean }) {
  if (!required) {
    return <span className="text-gray-300 text-sm">N/A</span>;
  }
  if (count > 0) {
    return <span className="text-green-600 font-bold">{count}</span>;
  }
  return <span className="text-red-500 font-bold">0</span>;
}
