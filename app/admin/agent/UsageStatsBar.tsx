"use client";

import { useState, useEffect } from "react";

interface UsagePeriod {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface UsageStats {
  today: UsagePeriod;
  month: UsagePeriod;
  year: UsagePeriod;
  pricingLastUpdated: string;
}

function formatCost(cost: number): string {
  if (cost < 0.01 && cost > 0) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

function StatGroup({
  label,
  period,
}: {
  label: string;
  period: UsagePeriod;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">
        {period.calls}
        <span className="text-gray-400 font-normal">
          {period.calls === 1 ? " call" : " calls"}
        </span>
      </span>
      <span className="text-gray-300">·</span>
      <span className="font-medium text-gray-700">
        {formatCost(period.cost)}
      </span>
    </div>
  );
}

export default function UsageStatsBar({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/agent/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setStats(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center gap-6 py-1.5 px-3 bg-gray-50/80 border-b border-gray-100 text-xs">
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0.5 py-1.5 px-3 bg-gray-50/80 border-b border-gray-100 text-[11px]">
      <StatGroup label="Today" period={stats.today} />
      <StatGroup label="Month" period={stats.month} />
      <StatGroup label="Year" period={stats.year} />
    </div>
  );
}
