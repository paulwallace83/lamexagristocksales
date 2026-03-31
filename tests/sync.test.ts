import { describe, it, expect } from "vitest";
import { generateProductId } from "../lib/sync";

// generateProductId is a pure function — no DB or filesystem access required

describe("generateProductId", () => {
  it("generates id for a basic IQF product", () => {
    expect(generateProductId("Apple", "IQF", null, false, null)).toBe("apple-iqf");
  });

  it("abbreviates Juice Concentrate as jc", () => {
    expect(generateProductId("Apple", "Juice Concentrate", null, false, null)).toBe("apple-jc");
  });

  it("abbreviates Puree as puree", () => {
    expect(generateProductId("Mango", "Puree", null, false, null)).toBe("mango-puree");
  });

  it("includes specification in the id", () => {
    expect(generateProductId("Apple", "Juice Concentrate", "70 Brix", false, null)).toBe("apple-jc-70-brix");
  });

  it("includes variety in the id", () => {
    expect(generateProductId("Apple", "IQF", null, false, "Fuji")).toBe("apple-iqf-fuji");
  });

  it("appends organic suffix when organic is true", () => {
    expect(generateProductId("Apple", "Juice Concentrate", "70 Brix", true, null)).toBe("apple-jc-70-brix-organic");
  });

  it("does NOT append organic suffix when organic is false", () => {
    expect(generateProductId("Apple", "IQF", null, false, null)).toBe("apple-iqf");
    expect(generateProductId("Apple", "IQF", null, false, null)).not.toContain("organic");
  });

  it("combines specification, variety, and organic", () => {
    expect(generateProductId("Strawberry", "IQF", "Grade A", true, "Camarosa")).toBe(
      "strawberry-iqf-grade-a-camarosa-organic"
    );
  });

  it("slugifies special characters and spaces", () => {
    expect(generateProductId("Black Berry", "IQF", null, false, null)).toBe("black-berry-iqf");
    expect(generateProductId("Apple (organic)", "Puree", null, false, null)).toBe("apple-organic-puree");
  });

  it("lowercases all parts", () => {
    const id = generateProductId("MANGO", "IQF", "DICE", false, null);
    expect(id).toBe(id.toLowerCase());
  });

  it("handles multi-word commodity", () => {
    expect(generateProductId("Passion Fruit", "Puree", null, false, null)).toBe("passion-fruit-puree");
  });

  it("uses slugified format for non-standard formats", () => {
    expect(generateProductId("Coconut", "Freeze Dried", null, false, null)).toBe("coconut-freeze-dried");
  });
});
