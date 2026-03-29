import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "./db";

/* ------------------------------------------------------------------ */
/*  Pricing config                                                     */
/* ------------------------------------------------------------------ */

interface PricingConfig {
  model: string;
  lastUpdated: string;
  rates: {
    inputPerMTok: number;
    outputPerMTok: number;
    cacheCreationPerMTok: number;
    cacheReadPerMTok: number;
  };
}

let _pricing: PricingConfig | null = null;

function getPricing(): PricingConfig {
  if (!_pricing) {
    _pricing = JSON.parse(
      readFileSync(join(process.cwd(), "data", "api-pricing.json"), "utf-8")
    );
  }
  return _pricing!;
}

/* ------------------------------------------------------------------ */
/*  Cost calculation                                                   */
/* ------------------------------------------------------------------ */

export function calculateCost(tokens: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  const { rates } = getPricing();
  return (
    (tokens.inputTokens / 1_000_000) * rates.inputPerMTok +
    (tokens.outputTokens / 1_000_000) * rates.outputPerMTok +
    (tokens.cacheCreationTokens / 1_000_000) * rates.cacheCreationPerMTok +
    (tokens.cacheReadTokens / 1_000_000) * rates.cacheReadPerMTok
  );
}

/* ------------------------------------------------------------------ */
/*  Record usage                                                       */
/* ------------------------------------------------------------------ */

export interface UsageRecord {
  conversationId?: string | null;
  userEmail: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  iterations: number;
}

export function recordUsage(data: UsageRecord): void {
  const db = getDb();
  const cost = calculateCost(data);
  db.prepare(
    `INSERT INTO api_usage
      (conversation_id, user_email, model, input_tokens, output_tokens,
       cache_creation_tokens, cache_read_tokens, iterations, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.conversationId ?? null,
    data.userEmail,
    data.model,
    data.inputTokens,
    data.outputTokens,
    data.cacheCreationTokens,
    data.cacheReadTokens,
    data.iterations,
    cost,
    new Date().toISOString()
  );
}

/* ------------------------------------------------------------------ */
/*  Query stats                                                        */
/* ------------------------------------------------------------------ */

export interface UsagePeriod {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface UsageStats {
  today: UsagePeriod;
  month: UsagePeriod;
  year: UsagePeriod;
  pricingLastUpdated: string;
}

function queryPeriod(since: string): UsagePeriod {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as calls,
         COALESCE(SUM(input_tokens), 0) as inputTokens,
         COALESCE(SUM(output_tokens), 0) as outputTokens,
         COALESCE(SUM(cost_usd), 0) as cost
       FROM api_usage
       WHERE created_at >= ?`
    )
    .get(since) as {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  return row;
}

export function getUsageStats(): UsageStats {
  const now = new Date();

  // Today: start of current day (local)
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  // This month: start of current month
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  // This year: start of current year
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const pricing = getPricing();

  return {
    today: queryPeriod(todayStart),
    month: queryPeriod(monthStart),
    year: queryPeriod(yearStart),
    pricingLastUpdated: pricing.lastUpdated,
  };
}
