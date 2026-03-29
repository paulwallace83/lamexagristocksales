"use client";

import { useState, useEffect } from "react";

interface LotAvailability {
  lotNumber: string;
  hasCOA: boolean;
  hasTestResults: boolean;
}

interface ContractAvailability {
  baseContract: string;
  hasSpecs: boolean;
}

interface AvailableDocsData {
  productId: string;
  productName: string;
  lots: LotAvailability[];
  contracts: ContractAvailability[];
}

interface RequestedDocItem {
  lotNumber?: string;
  baseContract?: string;
  categories: string[];
}

export default function DocumentRequestForm({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [data, setData] = useState<AvailableDocsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Selections: key is "lot:{lotNumber}:{category}" or "contract:{baseContract}:specs"
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${encodeURIComponent(productId)}/available-docs`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load document availability");
        return r.json();
      })
      .then((d: AvailableDocsData) => {
        setData(d);
        // Pre-select all available docs
        const initial = new Set<string>();
        for (const lot of d.lots) {
          if (lot.hasCOA) initial.add(`lot:${lot.lotNumber}:coa`);
          if (lot.hasTestResults) initial.add(`lot:${lot.lotNumber}:test-results`);
        }
        for (const c of d.contracts) {
          if (c.hasSpecs) initial.add(`contract:${c.baseContract}:specs`);
        }
        setSelected(initial);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [productId]);

  const toggleSelection = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setSubmitError("Please select at least one document.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    // Build requestedDocs from selections
    const lotItems = new Map<string, string[]>();
    const contractItems = new Map<string, string[]>();

    for (const key of selected) {
      const parts = key.split(":");
      if (parts[0] === "lot") {
        const lotNumber = parts[1];
        const cat = parts[2];
        if (!lotItems.has(lotNumber)) lotItems.set(lotNumber, []);
        lotItems.get(lotNumber)!.push(cat);
      } else if (parts[0] === "contract") {
        const bc = parts[1];
        const cat = parts[2];
        if (!contractItems.has(bc)) contractItems.set(bc, []);
        contractItems.get(bc)!.push(cat);
      }
    }

    const requestedDocs: RequestedDocItem[] = [];
    for (const [lotNumber, categories] of lotItems) {
      requestedDocs.push({ lotNumber, categories });
    }
    for (const [baseContract, categories] of contractItems) {
      requestedDocs.push({ baseContract, categories });
    }

    try {
      const res = await fetch("/api/document-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          requesterName: form.name,
          requesterCompany: form.company,
          requesterEmail: form.email,
          requesterPhone: form.phone || undefined,
          message: form.message || undefined,
          requestedDocs,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit request");
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading document availability...</div>;
  }

  if (error || !data) {
    return <div className="text-sm text-red-600 py-8 text-center">{error || "Failed to load"}</div>;
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Request Submitted</h3>
        <p className="text-sm text-gray-600">
          Our team will review your request and send the documents to <strong>{form.email}</strong> shortly.
        </p>
      </div>
    );
  }

  const hasAnyDocs =
    data.lots.some((l) => l.hasCOA || l.hasTestResults) ||
    data.contracts.some((c) => c.hasSpecs);

  if (!hasAnyDocs) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        No certificates or test results are currently available for this product.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product heading */}
      <div className="bg-[#1a2b5f]/5 border border-[#1a2b5f]/10 rounded-lg px-4 py-3">
        <p className="text-xs font-semibold text-[#1a2b5f]/60 uppercase tracking-wide">Product</p>
        <p className="text-sm font-bold text-[#1a2b5f]">{productName}</p>
      </div>

      {/* Document selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Documents to Request</h3>

        {/* Lot-level docs */}
        {data.lots.some((l) => l.hasCOA || l.hasTestResults) && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Certificates &amp; Test Results</p>
            <div className="space-y-2">
              {data.lots
                .filter((l) => l.hasCOA || l.hasTestResults)
                .map((lot) => (
                  <div key={lot.lotNumber} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <p className="font-mono text-sm font-bold text-[#1a2b5f] mb-1.5">Lot {lot.lotNumber}</p>
                    <div className="flex flex-wrap gap-3">
                      {lot.hasCOA && (
                        <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(`lot:${lot.lotNumber}:coa`)}
                            onChange={() => toggleSelection(`lot:${lot.lotNumber}:coa`)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-gray-700">Certificate of Analysis (COA)</span>
                        </label>
                      )}
                      {lot.hasTestResults && (
                        <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(`lot:${lot.lotNumber}:test-results`)}
                            onChange={() => toggleSelection(`lot:${lot.lotNumber}:test-results`)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-gray-700">Test Results</span>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Contract-level docs (specs) */}
        {data.contracts.some((c) => c.hasSpecs) && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Specification Sheets</p>
            <div className="space-y-2">
              {data.contracts
                .filter((c) => c.hasSpecs)
                .map((contract) => (
                  <div key={contract.baseContract} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(`contract:${contract.baseContract}:specs`)}
                        onChange={() => toggleSelection(`contract:${contract.baseContract}:specs`)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-gray-700">Spec Sheet — Contract {contract.baseContract}</span>
                    </label>
                  </div>
                ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">{selected.size} document{selected.size !== 1 ? "s" : ""} selected</p>
      </div>

      {/* Contact fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
          <input
            type="text"
            required
            maxLength={200}
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input
            type="email"
            required
            maxLength={254}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          rows={3}
          maxLength={2000}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Any additional requirements or questions..."
        />
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{submitError}</p>
      )}

      <button
        type="submit"
        disabled={submitting || selected.size === 0}
        className="w-full bg-emerald-600 text-white font-semibold py-3 px-6 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Request Documents"}
      </button>
    </form>
  );
}
