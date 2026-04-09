import { vi, describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Mock the DB so the module loads without needing an actual SQLite file
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));

import {
  detectCoaTestTypes,
  formatCoaFields,
  upsertCoaData,
  getCoaDataForLots,
  reviewCoaData,
  getCoaReviewQueue,
  exportCoaData,
  relinkCoaData,
} from "../lib/coa-data";
import { getDb } from "../lib/db";

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

// ─── Review workflow tests (B010) ────────────────────────────────────────────
//
// Uses a real in-memory SQLite instance via better-sqlite3 to exercise the
// actual SQL (CASE logic on upsert, CHECK constraint, round-trip via export/relink).

function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, product TEXT NOT NULL);
    CREATE TABLE listings (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id));
    CREATE TABLE lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id),
      lot_number TEXT NOT NULL
    );
    CREATE TABLE coa_data (
      lot_id INTEGER PRIMARY KEY REFERENCES lots(id),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(review_status IN ('pending','approved','rejected')),
      reviewed_at TEXT,
      reviewed_by TEXT
    );
  `);
  // Seed minimal fixtures: 1 product, 1 listing, 2 lots
  db.prepare("INSERT INTO products (id, product) VALUES ('p1', 'Apple JC')").run();
  db.prepare("INSERT INTO listings (id, product_id) VALUES (1, 'p1')").run();
  db.prepare("INSERT INTO lots (id, listing_id, lot_number) VALUES (1, 1, 'LOT-A')").run();
  db.prepare("INSERT INTO lots (id, listing_id, lot_number) VALUES (2, 1, 'LOT-B')").run();
  return db;
}

describe("upsertCoaData with reviewStatus", () => {
  beforeEach(() => {
    const db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db as never);
  });

  it("defaults to 'pending' when no status provided", () => {
    upsertCoaData(1, { brix: 11.5 }, "auto-extract");
    const data = getCoaDataForLots([1]).get(1);
    expect(data?.reviewStatus).toBe("pending");
    expect(data?.reviewedAt).toBeNull();
    expect(data?.reviewedBy).toBeNull();
  });

  it("sets 'approved' when explicitly passed and records reviewer", () => {
    upsertCoaData(1, { brix: 11.5 }, "agent", "approved");
    const data = getCoaDataForLots([1]).get(1);
    expect(data?.reviewStatus).toBe("approved");
    expect(data?.reviewedAt).toBeTruthy();
    expect(data?.reviewedBy).toBe("agent");
  });

  it("does not downgrade 'approved' to 'pending' on re-extract", () => {
    upsertCoaData(1, { brix: 11.5 }, "agent", "approved");
    // Simulate a backfill re-extraction with default 'pending' status
    upsertCoaData(1, { brix: 12.0, acidity: 0.9 }, "backfill");
    const data = getCoaDataForLots([1]).get(1);
    expect(data?.reviewStatus).toBe("approved");
    expect(data?.fields.brix).toBe(12.0); // Data WAS updated
    expect(data?.fields.acidity).toBe(0.9);
    expect(data?.reviewedAt).toBeTruthy(); // Original review metadata preserved
  });

  it("allows rejecting via upsert with explicit 'rejected' status", () => {
    upsertCoaData(1, { brix: 11 }, "agent", "rejected");
    const data = getCoaDataForLots([1]).get(1);
    expect(data?.reviewStatus).toBe("rejected");
  });

  it("rejects invalid review_status via CHECK constraint", () => {
    expect(() => upsertCoaData(1, { brix: 11 }, "x", "bogus" as never)).toThrow();
  });
});

describe("reviewCoaData", () => {
  beforeEach(() => {
    const db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db as never);
    upsertCoaData(1, { brix: 11.5 }, "auto-extract"); // creates pending row
  });

  it("approves a pending lot and records reviewer", () => {
    const ok = reviewCoaData(1, "approve", "qa@lamexfoods.com");
    expect(ok).toBe(true);
    const data = getCoaDataForLots([1]).get(1);
    expect(data?.reviewStatus).toBe("approved");
    expect(data?.reviewedBy).toBe("qa@lamexfoods.com");
    expect(data?.reviewedAt).toBeTruthy();
  });

  it("rejects a pending lot", () => {
    const ok = reviewCoaData(1, "reject", "qa@lamexfoods.com");
    expect(ok).toBe(true);
    expect(getCoaDataForLots([1]).get(1)?.reviewStatus).toBe("rejected");
  });

  it("returns false for non-existent lot", () => {
    expect(reviewCoaData(999, "approve", "qa@lamexfoods.com")).toBe(false);
  });
});

describe("getCoaReviewQueue", () => {
  beforeEach(() => {
    const db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db as never);
  });

  it("returns empty array when no COA data exists", () => {
    expect(getCoaReviewQueue()).toEqual([]);
  });

  it("returns pending rows", () => {
    upsertCoaData(1, { brix: 11 }, "auto-extract");
    upsertCoaData(2, { brix: 12 }, "auto-extract");
    const queue = getCoaReviewQueue();
    expect(queue.length).toBe(2);
    expect(queue.every((r) => r.reviewStatus === "pending")).toBe(true);
  });

  it("returns rejected rows", () => {
    upsertCoaData(1, { brix: 11 }, "agent", "rejected");
    const queue = getCoaReviewQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].reviewStatus).toBe("rejected");
  });

  it("excludes approved rows", () => {
    upsertCoaData(1, { brix: 11 }, "agent", "approved");
    upsertCoaData(2, { brix: 12 }, "auto-extract");
    const queue = getCoaReviewQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].lotNumber).toBe("LOT-B");
  });

  it("filters by productId when provided", () => {
    upsertCoaData(1, { brix: 11 }, "auto-extract");
    expect(getCoaReviewQueue("p1").length).toBe(1);
    expect(getCoaReviewQueue("nope").length).toBe(0);
  });

  it("includes product name, lot number, fields, and audit metadata", () => {
    upsertCoaData(1, { brix: 11, acidity: 0.8 }, "auto-extract");
    const [row] = getCoaReviewQueue();
    expect(row.productName).toBe("Apple JC");
    expect(row.lotNumber).toBe("LOT-A");
    expect(row.productId).toBe("p1");
    expect(row.fields).toEqual({ brix: 11, acidity: 0.8 });
    expect(row.updatedBy).toBe("auto-extract");
  });
});

describe("exportCoaData / relinkCoaData preserve review status", () => {
  it("round-trips review_status, reviewed_at, reviewed_by across export+relink", () => {
    const db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db as never);
    upsertCoaData(1, { brix: 11 }, "agent", "approved");
    upsertCoaData(2, { brix: 12 }, "auto-extract");
    const exported = exportCoaData();
    expect(exported.length).toBe(2);

    const approvedRow = exported.find((r) => r.lotNumber === "LOT-A");
    expect(approvedRow?.reviewStatus).toBe("approved");
    expect(approvedRow?.reviewedAt).toBeTruthy();
    expect(approvedRow?.reviewedBy).toBe("agent");

    const pendingRow = exported.find((r) => r.lotNumber === "LOT-B");
    expect(pendingRow?.reviewStatus).toBe("pending");
    expect(pendingRow?.reviewedAt).toBeNull();

    // Simulate a sync: drop all coa_data + lots, re-insert lots with new IDs
    db.exec("DELETE FROM coa_data; DELETE FROM lots;");
    db.prepare("INSERT INTO lots (id, listing_id, lot_number) VALUES (100, 1, 'LOT-A')").run();
    db.prepare("INSERT INTO lots (id, listing_id, lot_number) VALUES (101, 1, 'LOT-B')").run();

    const result = relinkCoaData(exported);
    expect(result).toEqual({ linked: 2, orphaned: 0 });

    // Verify review status survived through the new lot IDs
    const relinked = getCoaDataForLots([100, 101]);
    expect(relinked.get(100)?.reviewStatus).toBe("approved");
    expect(relinked.get(100)?.reviewedBy).toBe("agent");
    expect(relinked.get(101)?.reviewStatus).toBe("pending");
    expect(relinked.get(101)?.reviewedAt).toBeNull();
  });

  it("reports orphaned rows when lot numbers do not match after relink", () => {
    const db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db as never);
    upsertCoaData(1, { brix: 11 }, "auto-extract");
    const exported = exportCoaData();

    // Drop data; re-insert lots with DIFFERENT lot numbers
    db.exec("DELETE FROM coa_data; DELETE FROM lots;");
    db.prepare("INSERT INTO lots (id, listing_id, lot_number) VALUES (100, 1, 'LOT-XYZ')").run();

    const result = relinkCoaData(exported);
    expect(result).toEqual({ linked: 0, orphaned: 1 });
  });
});
