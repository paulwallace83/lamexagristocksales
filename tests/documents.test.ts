import { vi, describe, it, expect } from "vitest";

// Mock all DB/filesystem dependencies so we can test pure logic
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/inventory-db", () => ({ getInventory: vi.fn() }));
vi.mock("../lib/paths", () => ({ getUploadsRoot: vi.fn(() => "/tmp/test-uploads") }));

import {
  getCategoryLabel,
  getShortCategoryLabel,
  getRequiredDocs,
  generateDocFilename,
  removeDocument,
} from "../lib/documents";
import { getDb } from "../lib/db";
import type { Product } from "../lib/inventory";

// ─── getCategoryLabel ─────────────────────────────────────────────────────────

describe("getCategoryLabel", () => {
  it("maps coa correctly", () => {
    expect(getCategoryLabel("coa")).toBe("Certificates of Analysis (COA)");
  });
  it("maps test-results correctly", () => {
    expect(getCategoryLabel("test-results")).toBe("Pesticide & Test Results");
  });
  it("maps specs correctly", () => {
    expect(getCategoryLabel("specs")).toBe("Specification Sheets");
  });
  it("maps labels correctly", () => {
    expect(getCategoryLabel("labels")).toBe("Label Photos");
  });
  it("maps photos correctly", () => {
    expect(getCategoryLabel("photos")).toBe("Product Photos");
  });
});

// ─── getShortCategoryLabel ────────────────────────────────────────────────────

describe("getShortCategoryLabel", () => {
  it("maps coa to COA", () => {
    expect(getShortCategoryLabel("coa")).toBe("COA");
  });
  it("maps test-results to Test Results", () => {
    expect(getShortCategoryLabel("test-results")).toBe("Test Results");
  });
  it("maps specs to Spec Sheet", () => {
    expect(getShortCategoryLabel("specs")).toBe("Spec Sheet");
  });
  it("maps labels to Label", () => {
    expect(getShortCategoryLabel("labels")).toBe("Label");
  });
  it("maps photos to Product Photo", () => {
    expect(getShortCategoryLabel("photos")).toBe("Product Photo");
  });
});

// ─── getRequiredDocs ──────────────────────────────────────────────────────────

// Minimal product fixture
function makeProduct(format: string, organic = false): Product {
  return {
    id: "test-product",
    product: "Test Product",
    commodity: "Apple",
    format,
    processType: "Frozen",
    specification: null,
    variety: null,
    organic,
    packSize: null,
    certifications: [],
    listings: [],
  } as unknown as Product;
}

describe("getRequiredDocs", () => {
  it("IQF products require photos at contract level", () => {
    const req = getRequiredDocs(makeProduct("IQF"));
    expect(req.contractLevel).toContain("photos");
  });

  it("Juice Concentrate products do NOT require photos", () => {
    const req = getRequiredDocs(makeProduct("Juice Concentrate"));
    expect(req.contractLevel).not.toContain("photos");
  });

  it("Puree products do NOT require photos", () => {
    const req = getRequiredDocs(makeProduct("Puree"));
    expect(req.contractLevel).not.toContain("photos");
  });

  it("Juice Concentrate requires specs and labels at contract level", () => {
    const req = getRequiredDocs(makeProduct("Juice Concentrate"));
    expect(req.contractLevel).toContain("specs");
    expect(req.contractLevel).toContain("labels");
  });

  it("all formats require coa at lot level", () => {
    for (const format of ["IQF", "Juice Concentrate", "Puree"]) {
      const req = getRequiredDocs(makeProduct(format));
      expect(req.lotLevel).toContain("coa");
    }
  });
});

// ─── generateDocFilename ──────────────────────────────────────────────────────

// Use a guaranteed non-existent directory so existsSync returns false
// and the uniqueness counter is never triggered
const FAKE_DIR = `/tmp/lamex-test-${Date.now()}-doesnotexist`;

describe("generateDocFilename", () => {
  it("generates lot-level filename for COA", () => {
    const name = generateDocFilename({
      category: "coa",
      productName: "Apple JC",
      originalName: "test.pdf",
      documentDate: "2026-01-15",
      lotNumber: "LOT123",
      targetDir: FAKE_DIR,
    });
    expect(name).toBe("2026-01-15. Apple JC - COA - LOT123.pdf");
  });

  it("generates contract-level filename for specs", () => {
    const name = generateDocFilename({
      category: "specs",
      productName: "Apple JC",
      originalName: "spec.pdf",
      documentDate: "2026-01-15",
      baseContract: "124717",
      countryOfOrigin: "South Africa",
      targetDir: FAKE_DIR,
    });
    expect(name).toBe("2026-01-15. Apple JC - 124717 | South Africa | Spec Sheet.pdf");
  });

  it("generates fallback filename when no lot or contract", () => {
    const name = generateDocFilename({
      category: "coa",
      productName: "Apple JC",
      originalName: "doc.pdf",
      documentDate: "2026-01-15",
      targetDir: FAKE_DIR,
    });
    expect(name).toBe("2026-01-15. Apple JC - COA.pdf");
  });

  it("preserves file extension from originalName", () => {
    const pdf = generateDocFilename({
      category: "coa",
      productName: "Apple",
      originalName: "test.PDF",
      documentDate: "2026-01-15",
      lotNumber: "L001",
      targetDir: FAKE_DIR,
    });
    // Extension is lowercased or preserved — just check it ends with a known ext
    expect(pdf.toLowerCase()).toMatch(/\.pdf$/);

    const jpg = generateDocFilename({
      category: "photos",
      productName: "Apple",
      originalName: "photo.jpg",
      documentDate: "2026-01-15",
      baseContract: "123456",
      countryOfOrigin: "USA",
      targetDir: FAKE_DIR,
    });
    expect(jpg.toLowerCase()).toMatch(/\.jpg$/);
  });

  it("uses today's date when documentDate is not provided", () => {
    const today = new Date().toISOString().slice(0, 10);
    const name = generateDocFilename({
      category: "coa",
      productName: "Mango",
      originalName: "coa.pdf",
      lotNumber: "L999",
      targetDir: FAKE_DIR,
    });
    expect(name).toMatch(new RegExp(`^${today}`));
  });

  it("uses Unknown as COO when countryOfOrigin is not provided for contract-level", () => {
    const name = generateDocFilename({
      category: "specs",
      productName: "Mango Puree",
      originalName: "spec.pdf",
      documentDate: "2026-01-15",
      baseContract: "999999",
      targetDir: FAKE_DIR,
    });
    expect(name).toContain("Unknown");
  });
});

// ─── removeDocument ──────────────────────────────────────────────────────────

describe("removeDocument", () => {
  it("returns true when a matching row is deleted", () => {
    const mockRun = vi.fn().mockReturnValue({ changes: 1 });
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
    const mockPragma = vi.fn();
    vi.mocked(getDb).mockReturnValue({ prepare: mockPrepare, pragma: mockPragma } as never);

    expect(removeDocument("prod-1", "doc-abc")).toBe(true);
    expect(mockPragma).toHaveBeenCalledWith("foreign_keys = ON");
    expect(mockPrepare).toHaveBeenCalledWith("DELETE FROM documents WHERE product_id = ? AND id = ?");
    expect(mockRun).toHaveBeenCalledWith("prod-1", "doc-abc");
  });

  it("returns false when no matching row exists", () => {
    const mockRun = vi.fn().mockReturnValue({ changes: 0 });
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
    const mockPragma = vi.fn();
    vi.mocked(getDb).mockReturnValue({ prepare: mockPrepare, pragma: mockPragma } as never);

    expect(removeDocument("prod-1", "nonexistent")).toBe(false);
  });
});
