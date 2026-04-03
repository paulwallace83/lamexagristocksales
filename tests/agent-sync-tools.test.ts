import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock all transitive dependencies that load native modules or touch disk
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/agent-db", () => ({
  getProductSummaries: vi.fn(),
  findLotsByNumber: vi.fn(),
  findLotsByNumbers: vi.fn(),
  findByContractNumber: vi.fn(),
  searchProducts: vi.fn(),
  getSyncInfo: vi.fn(),
  getTestResultCoverage: vi.fn(),
  getCoaBackfillStatus: vi.fn(),
  getCoaBackfillDocuments: vi.fn(),
}));
vi.mock("../lib/inventory-db", () => ({ getProductById: vi.fn() }));
vi.mock("../lib/documents", () => ({
  getDocumentStatus: vi.fn(),
  addDocument: vi.fn(),
  getUploadDir: vi.fn(),
  getDocumentUrl: vi.fn(),
  generateDocFilename: vi.fn(),
}));
vi.mock("../lib/discount", () => ({
  getDiscountItems: vi.fn(),
  addDiscountItemsFromLots: vi.fn(),
  restoreToInventory: vi.fn(),
}));
vi.mock("../lib/product-flags", () => ({
  clearFlags: vi.fn(),
  getNewArrivalsWithNames: vi.fn(),
}));
vi.mock("../lib/paths", () => ({
  getUploadsRoot: vi.fn(() => "/tmp/test-uploads"),
}));

import { executeTool } from "../lib/agent-tools";
import { clearFlags, getNewArrivalsWithNames } from "../lib/product-flags";

const emptyFileMap = new Map();

// ─── get_new_arrivals ─────────────────────────────────────────────────────────

describe("get_new_arrivals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns flagged products with names when flags exist", async () => {
    vi.mocked(getNewArrivalsWithNames).mockReturnValue([
      { productId: "apple-jc-organic", productName: "Apple Juice Concentrate (Organic)", flaggedAt: "2026-04-01" },
      { productId: "mango-iqf-conv", productName: "Mango IQF (Conventional)", flaggedAt: "2026-04-01" },
    ]);

    const result = await executeTool("get_new_arrivals", {}, emptyFileMap, "test@lamex.com");

    expect(result).toEqual({
      arrivals: [
        { productId: "apple-jc-organic", productName: "Apple Juice Concentrate (Organic)", flaggedAt: "2026-04-01" },
        { productId: "mango-iqf-conv", productName: "Mango IQF (Conventional)", flaggedAt: "2026-04-01" },
      ],
      count: 2,
    });
    expect(getNewArrivalsWithNames).toHaveBeenCalled();
  });

  it("returns empty array when no flags exist", async () => {
    vi.mocked(getNewArrivalsWithNames).mockReturnValue([]);

    const result = await executeTool("get_new_arrivals", {}, emptyFileMap, "test@lamex.com");

    expect(result).toEqual({ arrivals: [], count: 0 });
  });
});

// ─── clear_new_arrivals ───────────────────────────────────────────────────────

describe("clear_new_arrivals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears flags and returns count", async () => {
    vi.mocked(clearFlags).mockReturnValue(3);

    const result = await executeTool("clear_new_arrivals", {}, emptyFileMap, "test@lamex.com");

    expect(result).toEqual({ success: true, cleared: 3 });
    expect(clearFlags).toHaveBeenCalledWith("new_arrival");
  });

  it("returns cleared: 0 when no flags exist", async () => {
    vi.mocked(clearFlags).mockReturnValue(0);

    const result = await executeTool("clear_new_arrivals", {}, emptyFileMap, "test@lamex.com");

    expect(result).toEqual({ success: true, cleared: 0 });
    expect(clearFlags).toHaveBeenCalledWith("new_arrival");
  });
});
