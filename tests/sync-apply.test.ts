import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock all transitive DB/server dependencies — must be top-level
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/inventory-db", () => ({ getInventory: vi.fn() }));
vi.mock("../lib/paths", () => ({
  getUploadsRoot: vi.fn(() => "/tmp/test-uploads"),
  getDbPath: vi.fn(() => "/tmp/test.db"),
}));
vi.mock("../lib/coa-data", () => ({
  exportCoaData: vi.fn(() => []),
  relinkCoaData: vi.fn(() => ({ linked: 0, orphaned: 0 })),
}));
vi.mock("../lib/documents", () => ({
  relinkDocumentLots: vi.fn(() => ({ linked: 2, orphaned: 1 })),
}));
vi.mock("../lib/product-flags", () => ({
  setNewArrivals: vi.fn(() => 0),
}));
vi.mock("../lib/discount", () => ({
  deductDiscountLots: vi.fn(() => ({
    lotsRemoved: 0,
    listingsEmptied: 0,
    productsRemoved: 0,
    missing: 0,
    details: [],
  })),
  validateDiscountItems: vi.fn(),
  getDiscountItems: vi.fn(() => []),
}));

import { applySync, type SyncApplyResult } from "../lib/sync-apply";
import { getDb } from "../lib/db";
import { setNewArrivals } from "../lib/product-flags";
import { getDiscountItems, validateDiscountItems } from "../lib/discount";

// ─── Test fixtures ──────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `sync-apply-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "snapshots"), { recursive: true });
  return dir;
}

function writeJsonFile(dir: string, name: string, data: any): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
}

const minimalInventory = {
  lastUpdated: "2026-04-01",
  products: [
    {
      id: "apple-iqf",
      product: "Apple IQF",
      commodity: "Apple",
      category: "Fruit",
      format: "IQF",
      processType: "Frozen",
      packSize: "30 lb",
      unitType: "cases",
      organic: false,
      listings: [
        {
          warehouse: "WH-001",
          city: "Los Angeles",
          state: "CA",
          supplier: "Supplier A",
          countryOfOrigin: "USA",
          quantity: 100,
          weightLbs: 3000,
          arrived: "2026-03-01",
          minBBD: "2027-03-01",
          contracts: ["ABC-001"],
        },
      ],
    },
  ],
};

const minimalSuppliers = {
  suppliers: [
    {
      id: "SUP-001",
      name: "Supplier A",
      countryOfOrigin: "USA",
      products: ["Apple IQF"],
    },
  ],
};

const minimalWarehouses = {
  warehouses: [
    {
      id: "WH-001",
      name: "Cold Storage LA",
      city: "Los Angeles",
      state: "CA",
      storageType: "Frozen",
    },
  ],
};

// ─── Mock DB helpers ────────────────────────────────────────────

function createMockDb() {
  const stmtRun = vi.fn(() => ({ lastInsertRowid: BigInt(1), changes: 1 }));
  const stmtAll = vi.fn(() => []);
  const stmtGet = vi.fn(() => ({ n: 0 }));
  const prepare = vi.fn(() => ({
    run: stmtRun,
    all: stmtAll,
    get: stmtGet,
  }));
  const exec = vi.fn();
  const transaction = vi.fn((fn: () => void) => fn);

  return { prepare, exec, transaction };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("applySync", () => {
  let dataDir: string;
  let lockFile: string;
  const tmpDirs: string[] = [];

  beforeEach(() => {
    dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    lockFile = join(dataDir, ".sync-lock");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    try {
      unlinkSync(lockFile);
    } catch {
      /* ignore */
    }
  });

  afterAll(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  // ── Missing proposed file ───────────────────────────────────

  it("throws when proposed file does not exist", () => {
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    expect(() =>
      applySync({
        proposedPath: join(dataDir, "inventory-proposed.json"),
        inventoryPath,
        dataDir,
      })
    ).toThrow("inventory-proposed.json");

    // Lock should be cleaned up
    expect(existsSync(lockFile)).toBe(false);
  });

  // ── Concurrent lock ─────────────────────────────────────────

  it("throws when lock already exists", () => {
    writeFileSync(lockFile, JSON.stringify({ pid: 99999, ts: "2026-01-01T00:00:00Z" }));

    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);

    expect(() =>
      applySync({ proposedPath, inventoryPath, dataDir })
    ).toThrow("Sync already in progress");

    // Lock file must NOT be deleted (belongs to "other" process)
    expect(existsSync(lockFile)).toBe(true);
  });

  // ── Lock cleanup on error ───────────────────────────────────

  it("cleans up lock file when DB transaction throws", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    const mockDb = createMockDb();
    mockDb.transaction.mockImplementation(() => {
      throw new Error("DB transaction failed");
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    expect(() =>
      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir })
    ).toThrow("DB transaction failed");

    // Lock should be cleaned up by the failing process
    expect(existsSync(lockFile)).toBe(false);
  });

  // ── Happy path ──────────────────────────────────────────────

  it("returns structured result with all expected fields", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    const mockDb = createMockDb();
    mockDb.transaction.mockImplementation((fn: () => void) => fn);
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result: SyncApplyResult = applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir });

    // Verify all fields exist with correct types
    expect(result.dryRun).toBe(false);
    expect(result.snapshotPath).toEqual(expect.stringContaining("snapshots/inventory-"));
    expect(result.productCount).toBe(1);
    expect(result.listingCount).toBe(1);
    expect(result.contractCount).toBe(1);
    expect(result.lotCount).toBe(0); // minimal fixture has no lots
    expect(result.warehouseCount).toBe(1);
    expect(result.supplierCount).toBe(1);
    expect(typeof result.documentsPreserved).toBe("number");
    expect(Array.isArray(result.orphanedDocs)).toBe(true);
    expect(result.relinkReport).toEqual({ linked: 2, orphaned: 1 });
    expect(result.coaRelinkReport).toEqual({ linked: 0, orphaned: 0 });
    expect(result.deductionReport).toEqual(
      expect.objectContaining({ lotsRemoved: 0, missing: 0 })
    );
    expect(result.validationReport).toBeNull();
    expect(Array.isArray(result.newArrivals)).toBe(true);
    expect(typeof result.cleanedUp).toBe("boolean");
    expect(typeof result.referenceFilesRegenerated).toBe("boolean");

    // Lock should be cleaned up
    expect(existsSync(lockFile)).toBe(false);
  });

  // ── Malformed JSON ─────────────────────────────────────────

  it("throws descriptive error when suppliers.json contains invalid JSON", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeFileSync(join(dataDir, "suppliers.json"), "not valid json{{{");
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    expect(() =>
      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir })
    ).toThrow("Invalid JSON");
  });

  // ── Missing products array ─────────────────────────────────

  it("throws when proposed JSON is missing products array", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", { lastUpdated: "2026-04-01" });
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    expect(() =>
      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir })
    ).toThrow("missing 'products' array");
  });

  // ── New arrivals detection ─────────────────────────────────

  it("detects new arrivals by comparing snapshot to proposed", () => {
    const previousInventory = {
      lastUpdated: "2026-03-25",
      products: [{ ...minimalInventory.products[0] }],
    };
    const proposedWithNew = {
      lastUpdated: "2026-04-01",
      products: [
        { ...minimalInventory.products[0] },
        {
          id: "mango-puree",
          product: "Mango Puree",
          commodity: "Mango",
          category: "Fruit",
          format: "Puree",
          processType: "Frozen",
          packSize: "44 lb",
          unitType: "drums",
          organic: false,
          listings: [],
        },
      ],
    };

    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", proposedWithNew);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", previousInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    const mockDb = createMockDb();
    mockDb.transaction.mockImplementation((fn: () => void) => fn);
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir });

    expect(result.newArrivals).toEqual(["mango-puree"]);
    expect(vi.mocked(setNewArrivals)).toHaveBeenCalledWith(["mango-puree"]);
  });

  // ── Discount validation path ───────────────────────────────

  it("runs discount validation when active discount items exist", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    const mockDb = createMockDb();
    mockDb.transaction.mockImplementation((fn: () => void) => fn);
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    // Configure mock to return active discount items
    vi.mocked(getDiscountItems).mockReturnValue([
      { id: "DI-001", productId: "apple-iqf", product: "Apple IQF", status: "active" } as any,
    ]);
    vi.mocked(validateDiscountItems).mockReturnValue({
      validated: 1,
      missing: 0,
      overlaps: [],
      details: [],
    });

    const result = applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir });

    expect(result.validationReport).not.toBeNull();
    expect(result.validationReport!.validated).toBe(1);
    expect(vi.mocked(validateDiscountItems)).toHaveBeenCalled();
  });

  // ── Missing file vs malformed JSON distinction ─────────────

  it("throws 'File not found' when suppliers.json is missing", () => {
    const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
    const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
    // deliberately not creating suppliers.json
    writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

    expect(() =>
      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir })
    ).toThrow("File not found");
  });

  // ── Dry-run mode ───────────────────────────────────────────

  describe("dry-run mode", () => {
    const inventoryWithLots = {
      lastUpdated: "2026-04-01",
      products: [
        {
          id: "apple-iqf",
          product: "Apple IQF",
          commodity: "Apple",
          category: "Fruit",
          format: "IQF",
          processType: "Frozen",
          packSize: "30 lb",
          unitType: "cases",
          organic: false,
          listings: [
            {
              warehouse: "WH-001",
              city: "Los Angeles",
              state: "CA",
              supplier: "Supplier A",
              countryOfOrigin: "USA",
              quantity: 100,
              weightLbs: 3000,
              arrived: "2026-03-01",
              minBBD: "2027-03-01",
              contracts: ["ABC-001", "ABC-002"],
              lots: [
                { lotNumber: "LOT-A1", quantity: 60, weightLbs: 1800, bbd: "2027-03-01" },
                { lotNumber: "LOT-A2", quantity: 40, weightLbs: 1200, bbd: "2027-06-01" },
              ],
            },
          ],
        },
      ],
    };

    it("returns counts with dryRun: true without writing files", () => {
      const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", inventoryWithLots);
      const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
      writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
      writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

      const inventoryBefore = readFileSync(inventoryPath, "utf-8");

      const result = applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir, dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.productCount).toBe(1);
      expect(result.listingCount).toBe(1);
      expect(result.contractCount).toBe(2);
      expect(result.lotCount).toBe(2);
      expect(result.warehouseCount).toBe(1);
      expect(result.supplierCount).toBe(1);
      expect(result.snapshotPath).toBe("(dry run)");

      // inventory.json must be byte-identical
      expect(readFileSync(inventoryPath, "utf-8")).toBe(inventoryBefore);

      // No snapshot created
      const snapshots = existsSync(join(dataDir, "snapshots"))
        ? readdirSync(join(dataDir, "snapshots"))
        : [];
      expect(snapshots.length).toBe(0);

      // proposed file NOT deleted
      expect(existsSync(proposedPath)).toBe(true);
    });

    it("does not call getDb()", () => {
      const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
      const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
      writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
      writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

      vi.mocked(getDb).mockClear();

      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir, dryRun: true });

      expect(getDb).not.toHaveBeenCalled();
    });

    it("acquires and releases the lock", () => {
      const proposedPath = writeJsonFile(dataDir, "inventory-proposed.json", minimalInventory);
      const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
      writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
      writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

      applySync({ proposedPath, inventoryPath, dataDir, rootDir: dataDir, dryRun: true });

      // Lock should be cleaned up after dry-run
      expect(existsSync(lockFile)).toBe(false);
    });

    it("still throws on preflight errors (missing proposed file)", () => {
      const inventoryPath = writeJsonFile(dataDir, "inventory.json", minimalInventory);
      writeJsonFile(dataDir, "suppliers.json", minimalSuppliers);
      writeJsonFile(dataDir, "warehouses.json", minimalWarehouses);

      expect(() =>
        applySync({
          proposedPath: join(dataDir, "inventory-proposed.json"),
          inventoryPath,
          dataDir,
          dryRun: true,
        })
      ).toThrow("inventory-proposed.json");

      // Lock cleaned up even on error
      expect(existsSync(lockFile)).toBe(false);
    });
  });
});
