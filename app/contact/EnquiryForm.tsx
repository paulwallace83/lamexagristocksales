"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LotAvailability {
  lotNumber: string;
  hasCOA: boolean;
  testResultTypes: string[];
  coaFields: { label: string; value: string }[];
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

export default function EnquiryForm({
  productId,
  productName,
  initialName,
  initialCompany,
  initialEmail,
}: {
  productId?: string;
  productName?: string;
  initialName?: string;
  initialCompany?: string;
  initialEmail?: string;
}) {
  const [docsData, setDocsData] = useState<AvailableDocsData | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Selections: key is "lot:{lotNumber}:{category}" or "contract:{baseContract}:specs"
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    name: initialName || "",
    company: initialCompany || "",
    email: initialEmail || "",
    phone: "",
    product: productName || "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [docsRequested, setDocsRequested] = useState(false);

  // Fetch available docs when productId is provided
  useEffect(() => {
    if (!productId) return;
    setDocsLoading(true);
    fetch(`/api/products/${encodeURIComponent(productId)}/available-docs`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d: AvailableDocsData) => setDocsData(d))
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [productId]);

  const hasAnyDocs =
    docsData &&
    (docsData.lots.some((l) => l.hasCOA || l.testResultTypes.length > 0 || l.coaFields.length > 0) ||
      docsData.contracts.some((c) => c.hasSpecs));

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
    setSubmitting(true);
    setSubmitError("");

    // Build requestedDocs from selections (only if toggle is on and docs selected)
    let requestedDocs: RequestedDocItem[] | undefined;
    if (showDocs && selected.size > 0) {
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
      requestedDocs = [];
      for (const [lotNumber, categories] of lotItems) {
        requestedDocs.push({ lotNumber, categories });
      }
      for (const [baseContract, categories] of contractItems) {
        requestedDocs.push({ baseContract, categories });
      }
    }

    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: productId || undefined,
          productName: productId ? productName : form.product,
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
        if (res.status === 429 && typeof data.retryAfter === "number") {
          const seconds = data.retryAfter;
          let friendly: string;
          if (seconds >= 60) {
            const mins = Math.ceil(seconds / 60);
            friendly = `Too many requests. Try again in ${mins} ${mins === 1 ? "minute" : "minutes"}.`;
          } else {
            friendly = `Too many requests. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
          }
          throw new Error(friendly);
        }
        throw new Error(data.error || "Failed to submit enquiry");
      }

      setDocsRequested(!!requestedDocs && requestedDocs.length > 0);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
          <svg
            className="w-8 h-8 text-[#1a2b5f]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          Enquiry Submitted
        </h3>
        <p className="text-sm text-gray-600">
          Our sales team will be in touch shortly.
        </p>
        {docsRequested && (
          <p className="text-sm text-gray-500 mt-2">
            Your document request has also been submitted for review.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6">
          {productId && (
            <Link
              href={`/product/${encodeURIComponent(productId)}`}
              className="text-sm font-medium text-[#4a90c4] hover:underline"
            >
              &larr; Back to Product
            </Link>
          )}
          <Link
            href="/"
            className="text-sm font-medium text-[#4a90c4] hover:underline"
          >
            Browse More Products &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product display */}
      {productId ? (
        <div className="bg-[#1a2b5f]/5 border border-[#1a2b5f]/10 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-[#1a2b5f]/60 uppercase tracking-wide">
            Product
          </p>
          <p className="text-sm font-bold text-[#1a2b5f]">{productName}</p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product of Interest
          </label>
          <input
            type="text"
            maxLength={300}
            value={form.product}
            onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
            placeholder="e.g., Mango IQF, Apple Juice Concentrate"
          />
        </div>
      )}

      {/* Contact fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company *
          </label>
          <input
            type="text"
            required
            maxLength={200}
            value={form.company}
            onChange={(e) =>
              setForm((f) => ({ ...f, company: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email *
          </label>
          <input
            type="email"
            required
            maxLength={254}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message
        </label>
        <textarea
          rows={4}
          maxLength={2000}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          placeholder="Quantity needed, delivery requirements, quality specs, etc."
        />
      </div>

      {/* Document request toggle — only when product-specific and docs exist */}
      {productId && !docsLoading && hasAnyDocs && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDocs(!showDocs)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <input
              type="checkbox"
              checked={showDocs}
              onChange={() => setShowDocs(!showDocs)}
              className="rounded border-gray-300 text-[#1a2b5f] focus:ring-[#4a90c4]"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Also request product documents
              </p>
              <p className="text-xs text-gray-500">
                COA, test results, and specification sheets
              </p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${showDocs ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showDocs && docsData && (
            <div className="px-4 py-4 space-y-4 border-t border-gray-200">
              {/* Lot-level docs */}
              {docsData.lots.some((l) => l.hasCOA || l.testResultTypes.length > 0 || l.coaFields.length > 0) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Certificates &amp; Test Results
                  </p>
                  <div className="space-y-2">
                    {docsData.lots
                      .filter((l) => l.hasCOA || l.testResultTypes.length > 0 || l.coaFields.length > 0)
                      .map((lot) => {
                        // Derive a single label for all test results on this lot.
                        // The backend category is unified ("test-results") so one checkbox covers all types.
                        const testLabel = lot.testResultTypes.length === 1
                          ? lot.testResultTypes[0]
                          : lot.testResultTypes.length > 1
                            ? (() => {
                                // Strip " Test Results" suffix or standalone "Test Results"; fall back to "Other"
                                const names = lot.testResultTypes.map((t) => t.replace(/\s*Test Results$/i, "").trim() || "Other");
                                return `${names.join(" & ")} Test Results`;
                              })()
                            : null;
                        return (
                          <div
                            key={lot.lotNumber}
                            className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100"
                          >
                            <p className="font-mono text-sm font-bold text-[#1a2b5f] mb-1.5">
                              Lot {lot.lotNumber}
                            </p>
                            {/* COA key aspects pills */}
                            {lot.coaFields.length > 0 && (
                              <div className="mb-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {lot.coaFields.map((f, i) => (
                                    <span
                                      key={`${f.label}-${i}`}
                                      className="text-xs bg-[#1a2b5f]/5 text-[#1a2b5f]/70 px-1.5 py-0.5 rounded"
                                    >
                                      <span className="font-medium">{f.label}:</span> {f.value}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1 italic">
                                  AI-extracted — may contain errors. Request official documents before contracting.
                                </p>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-3">
                              {lot.hasCOA && (
                                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(
                                      `lot:${lot.lotNumber}:coa`
                                    )}
                                    onChange={() =>
                                      toggleSelection(
                                        `lot:${lot.lotNumber}:coa`
                                      )
                                    }
                                    className="rounded border-gray-300 text-[#1a2b5f] focus:ring-[#4a90c4]"
                                  />
                                  <span className="text-gray-700">
                                    Certificate of Analysis (COA)
                                  </span>
                                </label>
                              )}
                              {testLabel && (
                                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(
                                      `lot:${lot.lotNumber}:test-results`
                                    )}
                                    onChange={() =>
                                      toggleSelection(
                                        `lot:${lot.lotNumber}:test-results`
                                      )
                                    }
                                    className="rounded border-gray-300 text-[#1a2b5f] focus:ring-[#4a90c4]"
                                  />
                                  <span className="text-gray-700">
                                    {testLabel}
                                  </span>
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Contract-level docs (specs) */}
              {docsData.contracts.some((c) => c.hasSpecs) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Specification Sheets
                  </p>
                  <div className="space-y-2">
                    {docsData.contracts
                      .filter((c) => c.hasSpecs)
                      .map((contract) => (
                        <div
                          key={contract.baseContract}
                          className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100"
                        >
                          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selected.has(
                                `contract:${contract.baseContract}:specs`
                              )}
                              onChange={() =>
                                toggleSelection(
                                  `contract:${contract.baseContract}:specs`
                                )
                              }
                              className="rounded border-gray-300 text-[#1a2b5f] focus:ring-[#4a90c4]"
                            />
                            <span className="text-gray-700">
                              Spec Sheet — Contract {contract.baseContract}
                            </span>
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {selected.size > 0 && (
                <p className="text-xs text-gray-400">
                  {selected.size} document{selected.size !== 1 ? "s" : ""}{" "}
                  selected
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#1a2b5f] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#4a90c4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Send Enquiry"}
      </button>
    </form>
  );
}
