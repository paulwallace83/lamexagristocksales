"use client";

import { useState } from "react";
import Link from "next/link";

interface DocumentRequest {
  id: number;
  productId: string;
  productName: string;
  requesterName: string;
  requesterCompany: string;
  requesterEmail: string;
  requestedDocs: Array<{ lotNumber?: string; baseContract?: string; categories: string[] }>;
  status: "pending" | "approved" | "rejected" | "sent";
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  sent: "bg-emerald-100 text-emerald-800",
};

const FILTERS = ["all", "pending", "approved", "rejected", "sent"] as const;

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RequestsListClient({ requests }: { requests: DocumentRequest[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const counts: Record<string, number> = { all: requests.length };
  for (const r of requests) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === f
                ? "bg-[#1a2b5f] text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {counts[f] ? (
              <span className={`ml-1.5 text-xs ${filter === f ? "text-white/70" : "text-gray-400"}`}>
                {counts[f]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Product</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider hidden md:table-cell">Requester</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider hidden lg:table-cell">Docs</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No {filter === "all" ? "" : filter} requests.
                </td>
              </tr>
            ) : (
              filtered.map((req) => {
                const docCount = req.requestedDocs.reduce((sum, item) => sum + item.categories.length, 0);
                return (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{req.id}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/requests/${req.id}`}
                        className="font-medium text-[#1a2b5f] hover:text-[#4a90c4] transition-colors"
                      >
                        {req.productName}
                      </Link>
                      <p className="text-xs text-gray-400 md:hidden mt-0.5">
                        {req.requesterName} — {req.requesterCompany}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-gray-900">{req.requesterName}</p>
                      <p className="text-xs text-gray-400">{req.requesterCompany}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                      {docCount} doc{docCount !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{timeAgo(req.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_STYLES[req.status]}`}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
