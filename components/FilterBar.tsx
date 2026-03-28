"use client";

interface FilterBarProps {
  commodities: string[];
  formats: string[];
  origins: string[];
  states: string[];
  types: string[];
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
  types,
  filters,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Search
          </label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => onFilterChange("search", e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4] focus:border-transparent bg-gray-50 hover:bg-white transition-colors"
            />
          </div>
        </div>

        <FilterSelect
          label="Commodity"
          value={filters.commodity}
          options={commodities}
          onChange={(v) => onFilterChange("commodity", v)}
        />
        <FilterSelect
          label="Type"
          value={filters.type}
          options={types}
          onChange={(v) => onFilterChange("type", v)}
        />
        <FilterSelect
          label="Format"
          value={filters.format}
          options={formats}
          onChange={(v) => onFilterChange("format", v)}
        />
        <FilterSelect
          label="Origin"
          value={filters.origin}
          options={origins}
          onChange={(v) => onFilterChange("origin", v)}
        />
        <FilterSelect
          label="Warehouse"
          value={filters.state}
          options={states}
          placeholder="All States"
          onChange={(v) => onFilterChange("state", v)}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  placeholder = "All",
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-[130px]">
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#4a90c4] transition-colors ${value ? "text-[#1a2b5f] font-medium" : "text-gray-500"}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
