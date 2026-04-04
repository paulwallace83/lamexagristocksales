import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "fs";

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
vi.mock("../lib/sync", () => ({
  computeDiff: vi.fn(),
  formatDiffReport: vi.fn(),
  reconciliationReport: vi.fn(),
}));
vi.mock("../lib/sync-apply", () => ({
  applySync: vi.fn(),
}));
vi.mock("../lib/excel-import", () => ({
  importFromBuffer: vi.fn(),
  formatReviewSummarySanitized: vi.fn(() => "## Items for Review\n..."),
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(actual.existsSync),
  };
});

import { executeTool } from "../lib/agent-tools";
import type { FileData } from "../lib/agent-tools";
import { clearFlags, getNewArrivalsWithNames } from "../lib/product-flags";
import { computeDiff, formatDiffReport, reconciliationReport } from "../lib/sync";
import { applySync } from "../lib/sync-apply";
import { importFromBuffer, formatReviewSummarySanitized } from "../lib/excel-import";

const emptyFileMap = new Map();

// ─── get_new_arrivals ─────────────────────────────────────────────────────────

describe("get_new_arrivals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    vi.resetAllMocks();
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

// ─── get_reference_data ──────────────────────────────────────────────────────

describe("get_reference_data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns suppliers and warehouses arrays from JSON files", async () => {
    const mockSuppliers = { suppliers: [{ id: "s1", name: "Supplier A", countryOfOrigin: "Turkey" }] };
    const mockWarehouses = { warehouses: [{ id: "w1", name: "Warehouse A", city: "Newark", state: "NJ" }] };

    vi.mocked(readFileSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("suppliers.json")) return JSON.stringify(mockSuppliers);
      if (p.endsWith("warehouses.json")) return JSON.stringify(mockWarehouses);
      throw new Error(`Unexpected file: ${p}`);
    });

    const result = await executeTool("get_reference_data", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.suppliers).toEqual(mockSuppliers.suppliers);
    expect(result.warehouses).toEqual(mockWarehouses.warehouses);
  });

  it("returns error when file cannot be read", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    const result = await executeTool("get_reference_data", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("Failed to read reference data");
  });
});

// ─── save_proposed_inventory ─────────────────────────────────────────────────

describe("save_proposed_inventory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("writes valid products array and returns success", async () => {
    const products = [{ id: "apple-jc", product: "Apple JC", listings: [] }];

    const result = await executeTool("save_proposed_inventory", { products }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.success).toBe(true);
    expect(result.productCount).toBe(1);
    expect(result.path).toBe("data/inventory-proposed.json");
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    // Verify written content structure
    const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(writtenContent.products).toEqual(products);
    expect(writtenContent.lastUpdated).toBeDefined();
  });

  it("rejects when products is not an array", async () => {
    const result = await executeTool("save_proposed_inventory", { products: "not an array" }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("products must be an array");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects when products is empty", async () => {
    const result = await executeTool("save_proposed_inventory", { products: [] }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("products array must not be empty");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects when products is missing", async () => {
    const result = await executeTool("save_proposed_inventory", {}, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("products must be an array");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects when products is null", async () => {
    const result = await executeTool("save_proposed_inventory", { products: null }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("products must be an array");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects when products is a number", async () => {
    const result = await executeTool("save_proposed_inventory", { products: 123 }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("products must be an array");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("returns error when writeFileSync throws", async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error("ENOSPC: no space left on device");
    });

    const products = [{ id: "apple-jc", product: "Apple JC", listings: [] }];
    const result = await executeTool("save_proposed_inventory", { products }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("Failed to write inventory-proposed.json");
    expect(result.error).not.toContain("ENOSPC"); // must not leak raw error
  });
});

// ─── role gate (reviewer-only tools) ─────────────────────────────────────────

describe("reviewer-only tool gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects save_proposed_inventory for qa role", async () => {
    const result = await executeTool("save_proposed_inventory", { products: [{ id: "x" }] }, emptyFileMap, "test@lamex.com", "qa") as any;

    expect(result.error).toBe("This tool requires the reviewer role");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects apply_sync for qa role", async () => {
    const result = await executeTool("apply_sync", {}, emptyFileMap, "test@lamex.com", "qa") as any;

    expect(result.error).toBe("This tool requires the reviewer role");
    expect(applySync).not.toHaveBeenCalled();
  });

  it("rejects apply_sync when role is undefined", async () => {
    const result = await executeTool("apply_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toBe("This tool requires the reviewer role");
    expect(applySync).not.toHaveBeenCalled();
  });

  it("rejects import_inventory_file for qa role", async () => {
    const result = await executeTool("import_inventory_file", { fileName: "test.csv" }, emptyFileMap, "test@lamex.com", "qa") as any;

    expect(result.error).toBe("This tool requires the reviewer role");
    expect(importFromBuffer).not.toHaveBeenCalled();
  });
});

// ─── run_sync_diff ───────────────────────────────────────────────────────────

describe("run_sync_diff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns report, warnings, and summary when both files exist", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const mockDiff = {
      summary: { totalProductsBefore: 10, totalProductsAfter: 12, productsAdded: 2 },
      warnings: [{ type: "missing-coo", message: "Missing COO for Apple JC", requiresAction: true }],
      products: { added: [], removed: [], unchanged: [], modified: [] },
      references: { newSuppliers: [], newWarehouses: [] },
      date: "2026-04-03",
    };
    vi.mocked(computeDiff).mockReturnValue(mockDiff as any);
    vi.mocked(formatDiffReport).mockReturnValue("## Inventory Sync Report — 2026-04-03\n...");

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.report).toContain("Inventory Sync Report");
    expect(result.warnings).toEqual(mockDiff.warnings);
    expect(result.summary).toEqual(mockDiff.summary);
    expect(computeDiff).toHaveBeenCalledTimes(1);
    expect(formatDiffReport).toHaveBeenCalledTimes(1);
  });

  it("returns error when inventory-proposed.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("inventory-proposed.json")) return false;
      return true;
    });

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No inventory-proposed.json found");
    expect(computeDiff).not.toHaveBeenCalled();
  });

  it("returns error when inventory.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("inventory-proposed.json")) return true;
      if (p.endsWith("inventory.json")) return false;
      return true;
    });

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No inventory.json found");
    expect(computeDiff).not.toHaveBeenCalled();
  });

  it("returns error when computeDiff throws (malformed JSON)", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(computeDiff).mockImplementation(() => {
      throw new Error("Unexpected token in JSON at position 0");
    });

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toBe("Diff computation failed");
    expect(result.error).not.toContain("Unexpected token"); // must not leak raw error
    expect(formatDiffReport).not.toHaveBeenCalled();
  });

  it("returns error when suppliers.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("suppliers.json")) return false;
      return true;
    });

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No suppliers.json found");
    expect(computeDiff).not.toHaveBeenCalled();
  });

  it("returns error when warehouses.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("warehouses.json")) return false;
      return true;
    });

    const result = await executeTool("run_sync_diff", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No warehouses.json found");
    expect(computeDiff).not.toHaveBeenCalled();
  });
});

// ─── apply_sync ─────────────────────────────────────────────────────────────

describe("apply_sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("returns success with sanitised result on happy path", async () => {
    const mockResult = {
      dryRun: false,
      snapshotPath: "/Users/paul/projects/lamexinventory/data/snapshots/inventory-2026-04-04.json",
      productCount: 12,
      listingCount: 30,
      contractCount: 25,
      lotCount: 80,
      warehouseCount: 5,
      supplierCount: 8,
      documentsPreserved: 42,
      orphanedDocs: [],
      relinkReport: { linked: 40, orphaned: 2 },
      coaRelinkReport: { linked: 15, orphaned: 0 },
      deductionReport: { deducted: 3, skipped: 0 },
      validationReport: null,
      newArrivals: ["apple-jc-organic"],
      cleanedUp: true,
      referenceFilesRegenerated: true,
    };
    vi.mocked(applySync).mockReturnValue(mockResult as any);

    const result = await executeTool("apply_sync", {}, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.success).toBe(true);
    expect(result.result.productCount).toBe(12);
    expect(result.result.lotCount).toBe(80);
    expect(result.result.newArrivals).toEqual(["apple-jc-organic"]);
    expect(result.result.relinkReport).toEqual({ linked: 40, orphaned: 2 });
    // Snapshot path must not contain absolute prefix
    expect(result.result.snapshotPath).toBe("data/snapshots/inventory-2026-04-04.json");
    expect(result.result.snapshotPath).not.toContain("/Users/");
    expect(applySync).toHaveBeenCalledTimes(1);
  });

  it("returns specific error when lock file exists", async () => {
    vi.mocked(applySync).mockImplementation(() => {
      throw new Error("Sync already in progress");
    });

    const result = await executeTool("apply_sync", {}, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toBe("Sync already in progress");
  });

  it("returns generic error on other failures without leaking paths", async () => {
    vi.mocked(applySync).mockImplementation(() => {
      throw new Error("File not found: /srv/railway/volume/data/inventory-proposed.json");
    });

    const result = await executeTool("apply_sync", {}, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toBe("Sync failed");
    expect(JSON.stringify(result)).not.toContain("/srv/");
    expect(JSON.stringify(result)).not.toContain("inventory-proposed");
  });
});

// ─── get_reconciliation ─────────────────────────────────────────────────────

describe("get_reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns report markdown on happy path", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(reconciliationReport).mockReturnValue(
      "## Reconciliation Report\n\n| Product | Unit Type | Total Qty | Total Weight (lbs) |\n...",
    );

    const result = await executeTool("get_reconciliation", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.report).toContain("Reconciliation Report");
    expect(reconciliationReport).toHaveBeenCalledTimes(1);
  });

  it("returns error when inventory.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("inventory.json")) return false;
      return true;
    });

    const result = await executeTool("get_reconciliation", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No inventory.json found");
    expect(reconciliationReport).not.toHaveBeenCalled();
  });

  it("returns generic error when reconciliationReport throws", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(reconciliationReport).mockImplementation(() => {
      throw new Error("Unexpected token in JSON at position 0");
    });

    const result = await executeTool("get_reconciliation", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toBe("Failed to generate reconciliation report");
    expect(JSON.stringify(result)).not.toContain("Unexpected token");
  });
});

// ─── dry_run_sync ──────────────────────────────────────────────────────────

describe("dry_run_sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns dryRun: true with counts on happy path", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(applySync).mockReturnValue({
      dryRun: true,
      snapshotPath: "(dry run)",
      productCount: 10,
      listingCount: 25,
      contractCount: 20,
      lotCount: 60,
      warehouseCount: 4,
      supplierCount: 7,
      documentsPreserved: 0,
      orphanedDocs: [],
      relinkReport: { linked: 0, orphaned: 0 },
      coaRelinkReport: { linked: 0, orphaned: 0 },
      deductionReport: { lotsRemoved: 0, listingsEmptied: 0, productsRemoved: 0, missing: 0, details: [] },
      validationReport: null,
      newArrivals: [],
      cleanedUp: false,
      referenceFilesRegenerated: false,
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.dryRun).toBe(true);
    expect(result.result.productCount).toBe(10);
    expect(result.result.listingCount).toBe(25);
    expect(result.result.contractCount).toBe(20);
    expect(result.result.lotCount).toBe(60);
    expect(result.result.warehouseCount).toBe(4);
    expect(result.result.supplierCount).toBe(7);
    expect(applySync).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });

  it("returns error when inventory-proposed.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("inventory-proposed.json")) return false;
      return true;
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No inventory-proposed.json found");
    expect(applySync).not.toHaveBeenCalled();
  });

  it("returns error when inventory.json is missing", async () => {
    vi.mocked(existsSync).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("inventory-proposed.json")) return true;
      if (p.endsWith("inventory.json")) return false;
      return true;
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toContain("No inventory.json found");
    expect(applySync).not.toHaveBeenCalled();
  });

  it("returns specific error when lock file exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(applySync).mockImplementation(() => {
      throw new Error("Sync already in progress");
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toBe("Sync already in progress");
  });

  it("returns generic error on unexpected failures", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(applySync).mockImplementation(() => {
      throw new Error("Cannot read file: /internal/path/data.json");
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com") as any;

    expect(result.error).toBe("Dry-run failed");
    expect(JSON.stringify(result)).not.toContain("/internal/");
  });

  it("is accessible to qa role (not reviewer-only)", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(applySync).mockReturnValue({
      dryRun: true,
      snapshotPath: "(dry run)",
      productCount: 5,
      listingCount: 10,
      contractCount: 8,
      lotCount: 20,
      warehouseCount: 3,
      supplierCount: 4,
      documentsPreserved: 0,
      orphanedDocs: [],
      relinkReport: { linked: 0, orphaned: 0 },
      coaRelinkReport: { linked: 0, orphaned: 0 },
      deductionReport: { lotsRemoved: 0, listingsEmptied: 0, productsRemoved: 0, missing: 0, details: [] },
      validationReport: null,
      newArrivals: [],
      cleanedUp: false,
      referenceFilesRegenerated: false,
    });

    const result = await executeTool("dry_run_sync", {}, emptyFileMap, "test@lamex.com", "qa") as any;

    expect(result.dryRun).toBe(true);
    expect(result.result.productCount).toBe(5);
  });
});

// ─── import_inventory_file ─────────────────────────────────────────────────

describe("import_inventory_file", () => {
  const mockImportResult = {
    included: {
      lastUpdated: "2026-04-04",
      products: [
        { id: "apple-jc", product: "Apple Juice Concentrate", listings: [{ quantity: 100, weightLbs: 50000 }] },
        { id: "mango-iqf", product: "Mango IQF", listings: [{ quantity: 200, weightLbs: 6000 }] },
      ],
    },
    excluded: [],
    review: [],
    warnings: [],
    stats: {
      totalRows: 50,
      activeRows: 50,
      positiveWeightRows: 48,
      hardExcluded: 5,
      softExcluded: 3,
      includedRows: 42,
      includedProducts: 2,
      includedListings: 2,
      includedWeightLbs: 56000,
      includedQuantity: 300,
      hardExclusionBreakdown: { "customer-excluded": 5 },
      softExclusionBreakdown: { "direct-customer": 3 },
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports file from fileMap and writes inventory-proposed.json", async () => {
    vi.mocked(importFromBuffer).mockReturnValue(mockImportResult as any);

    const fileMap = new Map<string, FileData>();
    fileMap.set("Book1.xlsx", {
      buffer: Buffer.from("fake-xlsx-data"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "Book1.xlsx",
    });

    const result = await executeTool("import_inventory_file", { fileName: "Book1.xlsx" }, fileMap, "test@lamex.com", "reviewer") as any;

    expect(result.success).toBe(true);
    expect(result.stats.includedProducts).toBe(2);
    expect(result.stats.includedWeightLbs).toBe(56000);
    expect(result.stats.hardExcluded).toBe(5);
    expect(result.stats.softExcluded).toBe(3);
    expect(result.proposedPath).toBe("data/inventory-proposed.json");
    expect(result.reviewPath).toBeNull();
    expect(result.reviewSummary).toBeNull();
    expect(importFromBuffer).toHaveBeenCalledTimes(1);
    expect(writeFileSync).toHaveBeenCalledTimes(1); // only proposed, no review
  });

  it("writes import-review.json when soft-excluded items exist", async () => {
    const resultWithReview = {
      ...mockImportResult,
      review: [
        {
          row: {
            Stock_Description: "Apple JC",
            Stock_Specification: "70 Brix",
            Stock_Cold_Store: "Newark",
            Stock_Contract_Supplier: "Supplier A",
            Stock_Origin_Country: "China",
            Stock_Contract: "ABC-123",
            Qty_Cases: 50,
            Qty_Weight_Net_Bal: 25000,
            Unit: "cases",
            Stock_Reserved: "",
            Stock_BestBefore: "2027-01-01",
            SML_LotNumber: "LOT001",
            Stock_Contract_Customer: "CUSTOMER",
          },
          reason: "direct-customer: CUSTOMER",
          ruleType: "soft" as const,
        },
      ],
    };
    vi.mocked(importFromBuffer).mockReturnValue(resultWithReview as any);

    const fileMap = new Map<string, FileData>();
    fileMap.set("data.csv", {
      buffer: Buffer.from("col1,col2\nval1,val2"),
      mimeType: "text/csv",
      name: "data.csv",
    });

    const result = await executeTool("import_inventory_file", { fileName: "data.csv" }, fileMap, "test@lamex.com", "reviewer") as any;

    expect(result.success).toBe(true);
    expect(result.reviewPath).toBe("data/import-review.json");
    expect(result.reviewSummary).toBeTruthy();
    expect(writeFileSync).toHaveBeenCalledTimes(2); // proposed + review
    expect(formatReviewSummarySanitized).toHaveBeenCalledTimes(1);
  });

  it("resolves file by case-insensitive name match", async () => {
    vi.mocked(importFromBuffer).mockReturnValue(mockImportResult as any);

    const fileMap = new Map<string, FileData>();
    fileMap.set("Book1.xlsx", {
      buffer: Buffer.from("fake-data"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "Book1.xlsx",
    });

    const result = await executeTool("import_inventory_file", { fileName: "book1.xlsx" }, fileMap, "test@lamex.com", "reviewer") as any;

    expect(result.success).toBe(true);
  });

  it("returns error when file not in fileMap", async () => {
    const result = await executeTool("import_inventory_file", { fileName: "missing.xlsx" }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("File 'missing.xlsx' not found");
    expect(result.error).toContain("Available files:");
    expect(importFromBuffer).not.toHaveBeenCalled();
  });

  it("returns error when fileName is empty", async () => {
    const result = await executeTool("import_inventory_file", { fileName: "" }, emptyFileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("fileName is required");
  });

  it("returns error when importFromBuffer throws", async () => {
    vi.mocked(importFromBuffer).mockImplementation(() => {
      throw new Error("Invalid file format");
    });

    const fileMap = new Map<string, FileData>();
    fileMap.set("bad.xlsx", {
      buffer: Buffer.from("corrupt-data"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "bad.xlsx",
    });

    const result = await executeTool("import_inventory_file", { fileName: "bad.xlsx" }, fileMap, "test@lamex.com", "reviewer") as any;

    expect(result.error).toContain("Failed to parse file:");
    expect(result.error).toContain("Invalid file format");
  });

  it("requires reviewer role", async () => {
    const fileMap = new Map<string, FileData>();
    fileMap.set("data.csv", {
      buffer: Buffer.from("data"),
      mimeType: "text/csv",
      name: "data.csv",
    });

    const result = await executeTool("import_inventory_file", { fileName: "data.csv" }, fileMap, "test@lamex.com", "qa") as any;

    expect(result.error).toBe("This tool requires the reviewer role");
    expect(importFromBuffer).not.toHaveBeenCalled();
  });
});
