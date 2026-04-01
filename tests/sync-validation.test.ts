import { describe, it, expect } from "vitest";
import { validateBusinessRules } from "../lib/sync";
import type { Product, InventoryData } from "../lib/inventory";

// Minimal product fixture
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "apple-iqf",
    product: "Apple IQF",
    commodity: "Apple",
    category: "Frozen",
    format: "IQF",
    processType: "Frozen",
    specification: null,
    variety: null,
    grade: null,
    organic: false,
    certifications: [],
    packSize: "20 lb",
    unitType: "Cases",
    listings: [],
    ...overrides,
  } as Product;
}

function makeInventory(products: Product[]): InventoryData {
  return { lastUpdated: "2026-04-01", products };
}

const emptySuppliersFile = { suppliers: [] };
const emptyWarehousesFile = { warehouses: [] };

// ─── Unit Type Validation ──────────────────────────────────────

describe("unit type validation", () => {
  it("returns warning for an invalid unit type", () => {
    const product = makeProduct({ unitType: "cse" });
    const warnings = validateBusinessRules(
      makeInventory([product]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const utWarnings = warnings.filter((w) => w.type === "invalid-unit-type");
    expect(utWarnings).toHaveLength(1);
    expect(utWarnings[0].requiresAction).toBe(false);
    expect(utWarnings[0].message).toContain("cse");
    expect(utWarnings[0].productId).toBe("apple-iqf");
  });

  it("returns warning for empty unit type", () => {
    const product = makeProduct({ unitType: "" });
    const warnings = validateBusinessRules(
      makeInventory([product]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const utWarnings = warnings.filter((w) => w.type === "invalid-unit-type");
    expect(utWarnings).toHaveLength(1);
    expect(utWarnings[0].message).toContain("(empty)");
  });

  it("does not warn for a valid unit type (case-insensitive)", () => {
    const product = makeProduct({ unitType: "Cases" });
    const warnings = validateBusinessRules(
      makeInventory([product]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const utWarnings = warnings.filter((w) => w.type === "invalid-unit-type");
    expect(utWarnings).toHaveLength(0);
  });

  it("accepts all canonical unit types regardless of casing", () => {
    const types = ["cases", "LBS", "Kgs", "PALLETS", "drums", "Totes", "bags", "Boxes", "mt"];
    for (const ut of types) {
      const product = makeProduct({ id: `test-${ut}`, unitType: ut });
      const warnings = validateBusinessRules(
        makeInventory([product]),
        emptySuppliersFile,
        emptyWarehousesFile
      );
      const utWarnings = warnings.filter((w) => w.type === "invalid-unit-type");
      expect(utWarnings).toHaveLength(0);
    }
  });
});

// ─── Unit Type Change Detection ─────────────────────────────────

describe("unit type change detection", () => {
  it("returns warning when unit type changes between syncs", () => {
    const current = makeProduct({ unitType: "Cases" });
    const proposed = makeProduct({ unitType: "Drums" });
    const warnings = validateBusinessRules(
      makeInventory([proposed]),
      emptySuppliersFile,
      emptyWarehousesFile,
      makeInventory([current])
    );
    const changeWarnings = warnings.filter((w) => w.type === "unit-type-changed");
    expect(changeWarnings).toHaveLength(1);
    expect(changeWarnings[0].requiresAction).toBe(false);
    expect(changeWarnings[0].message).toContain("Cases");
    expect(changeWarnings[0].message).toContain("Drums");
  });

  it("does not warn when unit type is unchanged", () => {
    const current = makeProduct({ unitType: "Cases" });
    const proposed = makeProduct({ unitType: "Cases" });
    const warnings = validateBusinessRules(
      makeInventory([proposed]),
      emptySuppliersFile,
      emptyWarehousesFile,
      makeInventory([current])
    );
    const changeWarnings = warnings.filter((w) => w.type === "unit-type-changed");
    expect(changeWarnings).toHaveLength(0);
  });

  it("does not warn when unit type differs only in casing", () => {
    const current = makeProduct({ unitType: "cases" });
    const proposed = makeProduct({ unitType: "Cases" });
    const warnings = validateBusinessRules(
      makeInventory([proposed]),
      emptySuppliersFile,
      emptyWarehousesFile,
      makeInventory([current])
    );
    const changeWarnings = warnings.filter((w) => w.type === "unit-type-changed");
    expect(changeWarnings).toHaveLength(0);
  });

  it("does not produce change warnings when current is not provided", () => {
    const proposed = makeProduct({ unitType: "Drums" });
    const warnings = validateBusinessRules(
      makeInventory([proposed]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const changeWarnings = warnings.filter((w) => w.type === "unit-type-changed");
    expect(changeWarnings).toHaveLength(0);
  });

  it("does not warn for new products not in current", () => {
    const current = makeProduct({ id: "mango-iqf", unitType: "Cases" });
    const proposed = makeProduct({ id: "apple-iqf", unitType: "Drums" });
    const warnings = validateBusinessRules(
      makeInventory([proposed]),
      emptySuppliersFile,
      emptyWarehousesFile,
      makeInventory([current])
    );
    const changeWarnings = warnings.filter((w) => w.type === "unit-type-changed");
    expect(changeWarnings).toHaveLength(0);
  });
});

// ─── Duplicate Product Detection ────────────────────────────────

describe("duplicate product detection", () => {
  it("returns warning for two products with same commodity/format/spec/organic", () => {
    const p1 = makeProduct({ id: "apple-iqf-1", product: "Apple IQF 1" });
    const p2 = makeProduct({ id: "apple-iqf-2", product: "Apple IQF 2" });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(1);
    expect(dupeWarnings[0].requiresAction).toBe(false);
    expect(dupeWarnings[0].message).toContain("apple-iqf-1");
    expect(dupeWarnings[0].message).toContain("apple-iqf-2");
  });

  it("does not warn when specification differs", () => {
    const p1 = makeProduct({ id: "apple-jc-1", specification: "70 Brix" });
    const p2 = makeProduct({ id: "apple-jc-2", specification: "50 Brix" });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(0);
  });

  it("does not warn when organic status differs", () => {
    const p1 = makeProduct({ id: "apple-iqf-1", organic: false });
    const p2 = makeProduct({ id: "apple-iqf-2", organic: true });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(0);
  });

  it("produces one warning for three products in the same group", () => {
    const p1 = makeProduct({ id: "apple-iqf-1", product: "Apple IQF 1" });
    const p2 = makeProduct({ id: "apple-iqf-2", product: "Apple IQF 2" });
    const p3 = makeProduct({ id: "apple-iqf-3", product: "Apple IQF 3" });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2, p3]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(1);
    expect(dupeWarnings[0].message).toContain("apple-iqf-1");
    expect(dupeWarnings[0].message).toContain("apple-iqf-2");
    expect(dupeWarnings[0].message).toContain("apple-iqf-3");
  });

  it("matches case-insensitively on commodity and format", () => {
    const p1 = makeProduct({ id: "a1", commodity: "Apple", format: "IQF" });
    const p2 = makeProduct({ id: "a2", commodity: "apple", format: "iqf" });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(1);
  });

  it("treats both-null specifications as equal for duplicate detection", () => {
    const p1 = makeProduct({ id: "a1", specification: null });
    const p2 = makeProduct({ id: "a2", specification: null });
    const warnings = validateBusinessRules(
      makeInventory([p1, p2]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const dupeWarnings = warnings.filter((w) => w.type === "probable-duplicate");
    expect(dupeWarnings).toHaveLength(1);
  });
});

// ─── Existing checks regression ─────────────────────────────────

describe("existing business rule checks", () => {
  it("still flags missing COO as blocking", () => {
    const product = makeProduct({
      listings: [
        {
          id: 1,
          warehouse: "ColdStore",
          city: "Miami",
          state: "FL",
          supplier: "Test Co",
          countryOfOrigin: "",
          quantity: 100,
          weightLbs: 2000,
          arrived: "2026-01-01",
          minBBD: "2027-01-01",
          contracts: [],
          lots: [],
        },
      ],
    });
    const warnings = validateBusinessRules(
      makeInventory([product]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const cooWarnings = warnings.filter((w) => w.type === "missing-coo");
    expect(cooWarnings).toHaveLength(1);
    expect(cooWarnings[0].requiresAction).toBe(true);
  });

  it("still flags unknown warehouse as blocking", () => {
    const product = makeProduct({
      listings: [
        {
          id: 1,
          warehouse: "UnknownPlace",
          city: "",
          state: "",
          supplier: "Test Co",
          countryOfOrigin: "USA",
          quantity: 100,
          weightLbs: 2000,
          arrived: "2026-01-01",
          minBBD: "2027-01-01",
          contracts: [],
          lots: [],
        },
      ],
    });
    const warnings = validateBusinessRules(
      makeInventory([product]),
      emptySuppliersFile,
      emptyWarehousesFile
    );
    const whWarnings = warnings.filter((w) => w.type === "unknown-warehouse");
    expect(whWarnings).toHaveLength(1);
    expect(whWarnings[0].requiresAction).toBe(true);
  });
});
