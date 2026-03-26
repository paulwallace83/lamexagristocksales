"use client";

interface FilterBarProps {
  commodities: string[];
  formats: string[];
  origins: string[];
  states: string[];
  filters: {
    commodity: string;
    format: string;
    origin: string;
    state: string;
    search: string;
    type: string;
  };
  onFilterChange: (key: string, value: string | boolean) => void;
}

export default function FilterBar({
  commodities,
  formats,
  origins,
  states,
  filters,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="Search products..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div className="min-w-[150px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Commodity
          </label>
          <select
            value={filters.commodity}
            onChange={(e) => onFilterChange("commodity", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            {commodities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Type
          </label>
          <select
            value={filters.type}
            onChange={(e) => onFilterChange("type", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            <option value="Organic">Organic</option>
            <option value="Conventional">Conventional</option>
          </select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Format
          </label>
          <select
            value={filters.format}
            onChange={(e) => onFilterChange("format", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            {formats.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Origin
          </label>
          <select
            value={filters.origin}
            onChange={(e) => onFilterChange("origin", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All</option>
            {origins.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[120px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Warehouse
          </label>
          <select
            value={filters.state}
            onChange={(e) => onFilterChange("state", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
