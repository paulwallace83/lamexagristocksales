"use client";

import { useState } from "react";

interface AggregatedGroup {
  key: string;
  reason: string;
  customer: string;
  product: string;
  specification: string;
  warehouse: string;
  supplier: string;
  origin: string;
  totalCases: number;
  totalWeight: number;
  reserved: boolean;
  itemIndices: number[];
}

export default function ReviewClient({
  groups,
  totalItems,
}: {
  groups: AggregatedGroup[];
  totalItems: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; remainingItems?: number } | null>(null);

  const directGroups = groups.filter((g) => !g.reserved);
  const reservedGroups = groups.filter((g) => g.reserved);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(groups.map((g) => g.key)));
  const selectNone = () => setSelected(new Set());
  const selectDirect = () => setSelected(new Set(directGroups.map((g) => g.key)));

  const selectedGroups = groups.filter((g) => selected.has(g.key));
  const selectedWeight = selectedGroups.reduce((s, g) => s + g.totalWeight, 0);
  const selectedCases = selectedGroups.reduce((s, g) => s + g.totalCases, 0);
  const selectedIndices = selectedGroups.flatMap((g) => g.itemIndices);

  const handleSubmit = async () => {
    if (selectedIndices.length === 0) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/review/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include: selectedIndices }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: data.message || "Review applied successfully", remainingItems: data.remainingItems ?? 0 });
      } else {
        setResult({ success: false, message: data.error || "Failed to apply review" });
      }
    } catch (err) {
      setResult({ success: false, message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    const hasRemaining = (result.remainingItems ?? 0) > 0;
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-green-800 mb-2">
            {hasRemaining ? "Items Added" : "Review Complete"}
          </h2>
          <p className="text-green-700 mb-4">{result.message}</p>
          {hasRemaining ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 bg-[#1a2b5f] text-white font-semibold rounded-md hover:bg-[#4a90c4] transition-colors"
              >
                Review Remaining {result.remainingItems} Items
              </button>
              <p className="text-sm text-gray-500">
                Or run <code className="bg-gray-100 px-2 py-1 rounded">npm run sync</code> to apply what&apos;s been approved so far.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Next step: run <code className="bg-gray-100 px-2 py-1 rounded">npm run sync</code> to apply changes.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Import Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            {groups.length} line items ({totalItems} raw rows) — select items to include in public inventory
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={selectAll} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Select All
          </button>
          <button onClick={selectDirect} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Direct Only
          </button>
          <button onClick={selectNone} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Clear
          </button>
        </div>
      </div>

      {result && !result.success && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {result.message}
        </div>
      )}

      {/* Direct Customer Stock */}
      {directGroups.length > 0 && (
        <Section title="Direct Customer Stock" groups={directGroups} selected={selected} toggle={toggle} />
      )}

      {/* Reserved Stock */}
      {reservedGroups.length > 0 && (
        <Section title="Reserved Stock" groups={reservedGroups} selected={selected} toggle={toggle} />
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 mt-8 py-4 px-4 -mx-4 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-800">{selectedGroups.length}</span> items selected
            {selectedGroups.length > 0 && (
              <span className="ml-3">
                {fmtNum(selectedCases)} units &middot; {fmtNum(Math.round(selectedWeight))} lbs
              </span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedIndices.length === 0}
            className="px-6 py-2.5 bg-[#1a2b5f] text-white font-semibold rounded-md hover:bg-[#4a90c4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Applying..." : `Include Selected (${selectedGroups.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  groups,
  selected,
  toggle,
}: {
  title: string;
  groups: AggregatedGroup[];
  selected: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
        {title === "Reserved Stock" && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />}
        {title === "Direct Customer Stock" && <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />}
        {title}
        <span className="text-sm font-normal text-gray-400">({groups.length})</span>
      </h2>

      <div className="space-y-2">
        {groups.map((g) => (
          <label
            key={g.key}
            className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
              selected.has(g.key)
                ? "bg-blue-50 border-blue-300"
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(g.key)}
              onChange={() => toggle(g.key)}
              className="mt-1 h-4 w-4 text-[#1a2b5f] rounded border-gray-300 focus:ring-[#4a90c4]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-800">{g.customer}</span>
                {g.reserved && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Reserved</span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {g.product}
                {g.specification ? ` — ${g.specification}` : ""}
              </div>
              <div className="flex gap-4 mt-1 text-xs text-gray-400">
                <span>{fmtNum(g.totalCases)} units</span>
                <span>{fmtNum(Math.round(g.totalWeight))} lbs</span>
                <span>{g.warehouse}</span>
                <span>{g.origin}</span>
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
