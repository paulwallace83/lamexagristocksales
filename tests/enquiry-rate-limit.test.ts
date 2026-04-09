import { describe, it, expect, beforeEach } from "vitest";
import {
  checkEnquiryRateLimit,
  resetEnquiryRateLimit,
} from "../lib/enquiry-rate-limit";

const EMAIL = "buyer@example.com";

describe("checkEnquiryRateLimit", () => {
  beforeEach(() => {
    resetEnquiryRateLimit();
  });

  it("allows the first 5 requests within the window", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      const res = checkEnquiryRateLimit(EMAIL, { now: t0 + i * 1000 });
      expect(res.allowed).toBe(true);
      expect(res.retryAfter).toBe(0);
    }
  });

  it("blocks the 6th request and returns retryAfter > 0", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      checkEnquiryRateLimit(EMAIL, { now: t0 + i * 1000 });
    }
    const blocked = checkEnquiryRateLimit(EMAIL, { now: t0 + 5_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    // Oldest timestamp is t0; window is 1 hour (3600s); now = t0 + 5s.
    // retryAfter = ceil((t0 + 3_600_000 - (t0 + 5_000)) / 1000) = ceil(3595) = 3595
    expect(blocked.retryAfter).toBe(3595);
  });

  it("allows a new request once the oldest timestamp falls out of the window", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      checkEnquiryRateLimit(EMAIL, { now: t0 + i * 1000 });
    }
    // Advance time so the oldest (t0) is just past the 1-hour window
    const later = t0 + 60 * 60 * 1000 + 1;
    const res = checkEnquiryRateLimit(EMAIL, { now: later });
    expect(res.allowed).toBe(true);
    expect(res.retryAfter).toBe(0);
  });

  it("returns retryAfter clamped to 0 when oldest is at exactly the window boundary", () => {
    const t0 = 1_000_000_000_000;
    // Fill 5 slots all at t0
    for (let i = 0; i < 5; i++) {
      checkEnquiryRateLimit(EMAIL, { now: t0 });
    }
    // Query at exactly t0 + window: oldest is filtered OUT (now - t == windowMs is NOT < windowMs),
    // so timestamps becomes empty and the request is allowed.
    const res = checkEnquiryRateLimit(EMAIL, { now: t0 + 60 * 60 * 1000 });
    expect(res.allowed).toBe(true);
    expect(res.retryAfter).toBe(0);
  });

  it("rate limits each email key independently", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      checkEnquiryRateLimit("a@example.com", { now: t0 + i * 1000 });
    }
    const blockedA = checkEnquiryRateLimit("a@example.com", { now: t0 + 5_000 });
    const allowedB = checkEnquiryRateLimit("b@example.com", { now: t0 + 5_000 });
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("normalizes email to lowercase for keying", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      checkEnquiryRateLimit("Buyer@Example.com", { now: t0 + i * 1000 });
    }
    const res = checkEnquiryRateLimit("buyer@example.com", { now: t0 + 5_000 });
    expect(res.allowed).toBe(false);
  });

  it("respects a custom maxPerHour override", () => {
    const t0 = 1_000_000_000_000;
    checkEnquiryRateLimit(EMAIL, { now: t0, maxPerHour: 2 });
    checkEnquiryRateLimit(EMAIL, { now: t0 + 1, maxPerHour: 2 });
    const blocked = checkEnquiryRateLimit(EMAIL, { now: t0 + 2, maxPerHour: 2 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
