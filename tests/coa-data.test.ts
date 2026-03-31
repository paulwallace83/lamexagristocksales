import { vi, describe, it, expect } from "vitest";

// Mock the DB so the module loads without needing an actual SQLite file
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));

import { detectCoaTestTypes, formatCoaFields } from "../lib/coa-data";

// ─── detectCoaTestTypes ───────────────────────────────────────────────────────

describe("detectCoaTestTypes", () => {
  it("returns false for both when fields is empty", () => {
    expect(detectCoaTestTypes({})).toEqual({ hasHeavyMetals: false, hasPesticide: false });
  });

  it("detects lead as heavy metal", () => {
    expect(detectCoaTestTypes({ lead: 0.05 })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
  });

  it("detects arsenic as heavy metal", () => {
    expect(detectCoaTestTypes({ arsenic: 0.01 })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
  });

  it("detects cadmium as heavy metal", () => {
    expect(detectCoaTestTypes({ cadmium: 0.02 })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
  });

  it("detects mercury as heavy metal", () => {
    expect(detectCoaTestTypes({ mercury: "ND" })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
  });

  it("does NOT treat metal_detection as a heavy metal (false positive guard)", () => {
    expect(detectCoaTestTypes({ metal_detection: "Pass" })).toEqual({ hasHeavyMetals: false, hasPesticide: false });
  });

  it("detects pesticide keyword", () => {
    expect(detectCoaTestTypes({ pesticide_residue: "ND" })).toEqual({ hasHeavyMetals: false, hasPesticide: true });
  });

  it("detects chlorpyrifos as pesticide", () => {
    expect(detectCoaTestTypes({ chlorpyrifos: 0.001 })).toEqual({ hasHeavyMetals: false, hasPesticide: true });
  });

  it("detects glyphosate as pesticide", () => {
    expect(detectCoaTestTypes({ glyphosate: "ND" })).toEqual({ hasHeavyMetals: false, hasPesticide: true });
  });

  it("detects both heavy metals and pesticide", () => {
    expect(detectCoaTestTypes({ lead: 0.05, glyphosate: "ND" })).toEqual({ hasHeavyMetals: true, hasPesticide: true });
  });

  it("brix field triggers neither", () => {
    expect(detectCoaTestTypes({ brix: 11.5 })).toEqual({ hasHeavyMetals: false, hasPesticide: false });
  });

  it("normalises key spacing/dots/hyphens before matching", () => {
    // Key with spaces — should still match "lead"
    expect(detectCoaTestTypes({ "lead content": 0.05 })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
    // Key with dots
    expect(detectCoaTestTypes({ "lead.total": 0.05 })).toEqual({ hasHeavyMetals: true, hasPesticide: false });
  });
});

// ─── formatCoaFields ─────────────────────────────────────────────────────────

describe("formatCoaFields", () => {
  it("returns empty array for empty fields", () => {
    expect(formatCoaFields({})).toEqual([]);
  });

  it("formats brix with unit", () => {
    const result = formatCoaFields({ brix: 11.5 });
    expect(result).toContainEqual({ label: "Brix", value: "11.5 Bx" });
  });

  it("formats acidity with unit", () => {
    const result = formatCoaFields({ acidity: 0.85 });
    expect(result).toContainEqual({ label: "Acidity", value: "0.85 %" });
  });

  it("formats pH without unit", () => {
    const result = formatCoaFields({ ph: 3.5 });
    expect(result).toContainEqual({ label: "pH", value: "3.5" });
  });

  it("formats color as string", () => {
    const result = formatCoaFields({ color: "Light Amber" });
    expect(result).toContainEqual({ label: "Color", value: "Light Amber" });
  });

  it("caps results at 6 pills maximum", () => {
    const fields = {
      brix: 11.5,
      acidity: 0.85,
      ph: 3.5,
      color: "Amber",
      clarity: "Clear",
      ratio: 14,
      defects: 1.2, // 7th field — should be cut
    };
    expect(formatCoaFields(fields).length).toBe(6);
  });

  it("excludes microorganism fields (salmonella, yeast, mold)", () => {
    const result = formatCoaFields({ brix: 11, salmonella: "ND", yeast: 10, mold: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Brix");
  });

  it("excludes heavy metal fields from display", () => {
    const result = formatCoaFields({ brix: 11, lead: 0.05, arsenic: 0.01 });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Brix");
  });

  it("excludes administrative fields (batch_no, shelf_life)", () => {
    const result = formatCoaFields({ brix: 11, batch_no: "ABC123", shelf_life: "24 months" });
    expect(result).toHaveLength(1);
  });

  it("merges evm sub-fields into a single EVM pill showing the minimum", () => {
    const result = formatCoaFields({ evm_leaves_caps_bracts: 0.5, evm_weeds_grass: 0.3 });
    expect(result).toContainEqual({ label: "EVM", value: "0.3" });
    expect(result).toHaveLength(1); // Only the merged pill, not two separate ones
  });

  it("title-cases unknown fields", () => {
    const result = formatCoaFields({ moisture_content: 12.5 });
    expect(result[0].label).toBe("Moisture Content");
  });

  it("caps string values at 50 characters", () => {
    const longValue = "A".repeat(60);
    const result = formatCoaFields({ color: longValue });
    expect(result[0].value.length).toBe(50);
  });

  it("places known fields before unknown fields", () => {
    const result = formatCoaFields({ some_unknown_field: "X", brix: 11 });
    expect(result[0].label).toBe("Brix"); // Known field comes first
    expect(result[1].label).toBe("Some Unknown Field");
  });

  it("skips null, undefined, and empty string values", () => {
    const fields = { brix: 11, color: "" } as Record<string, number | string>;
    const result = formatCoaFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Brix");
  });
});
