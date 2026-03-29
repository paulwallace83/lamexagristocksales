/**
 * scripts/update-pricing.ts — Fetch current Anthropic pricing and update data/api-pricing.json.
 *
 * Parses the model pricing table from the Anthropic docs page.
 * Falls back gracefully if the page structure changes or fetch fails.
 *
 * Usage: npm run update-pricing
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PRICING_URL =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const CONFIG_PATH = join(process.cwd(), "data", "api-pricing.json");

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

function readCurrentConfig(): PricingConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

/**
 * Parse a price string like "$3 / MTok" or "$0.30 / MTok" into a number.
 */
function parsePrice(s: string): number | null {
  const match = s.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract model pricing from the HTML page.
 *
 * The pricing table has columns:
 *   Model | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens
 *
 * We look for rows in <table> elements and match by model name.
 */
function extractPricing(
  html: string,
  modelName: string
): PricingConfig["rates"] | null {
  // Find all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];

    // Extract all cell contents, stripping HTML tags
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
    }

    if (cells.length < 6) continue;

    // Check if this row matches our model
    const rowModel = cells[0].toLowerCase().replace(/\s+/g, " ");
    const target = modelName.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");

    // Match "claude sonnet 4.6" against "Claude Sonnet 4.6"
    // The model ID "claude-sonnet-4-6" becomes "claude sonnet 4 6"
    // The page shows "Claude Sonnet 4.6"
    // Try both exact match and flexible match
    const targetVariants = [
      target,
      // Convert "claude sonnet 4 6" to "claude sonnet 4.6"
      target.replace(/(\d+)\s+(\d+)$/, "$1.$2"),
    ];

    const isMatch = targetVariants.some(
      (t) => rowModel.startsWith(t) && !rowModel.includes("deprecated")
    );

    if (!isMatch) continue;

    // columns: Model | Base Input | 5m Cache Writes | 1h Cache Writes | Cache Hits | Output
    const inputPrice = parsePrice(cells[1]);
    const cacheWritePrice = parsePrice(cells[2]); // 5-minute cache write
    const cacheReadPrice = parsePrice(cells[4]);
    const outputPrice = parsePrice(cells[5]);

    if (
      inputPrice !== null &&
      outputPrice !== null &&
      cacheWritePrice !== null &&
      cacheReadPrice !== null
    ) {
      // Sanity check: rates should be between $0.01 and $500 per MTok
      const allRates = [inputPrice, outputPrice, cacheWritePrice, cacheReadPrice];
      if (allRates.some((r) => r < 0.01 || r > 500)) {
        console.warn("Parsed rates outside expected bounds — skipping this row.");
        continue;
      }
      return {
        inputPerMTok: inputPrice,
        outputPerMTok: outputPrice,
        cacheCreationPerMTok: cacheWritePrice,
        cacheReadPerMTok: cacheReadPrice,
      };
    }
  }

  return null;
}

async function main() {
  const config = readCurrentConfig();
  console.log(
    `Current pricing for ${config.model} (last updated: ${config.lastUpdated}):`
  );
  console.log(`  Input:  $${config.rates.inputPerMTok}/MTok`);
  console.log(`  Output: $${config.rates.outputPerMTok}/MTok`);
  console.log(
    `  Cache write: $${config.rates.cacheCreationPerMTok}/MTok`
  );
  console.log(`  Cache read:  $${config.rates.cacheReadPerMTok}/MTok`);
  console.log();

  console.log(`Fetching pricing from ${PRICING_URL}...`);

  let html: string;
  try {
    const res = await fetch(PRICING_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } catch (err) {
    console.error(
      `Failed to fetch pricing page: ${err instanceof Error ? err.message : err}`
    );
    console.log("Keeping existing pricing config.");
    process.exit(0);
  }

  const rates = extractPricing(html, config.model);

  if (!rates) {
    console.warn(
      `Could not find pricing for model "${config.model}" in the page.`
    );
    console.log(
      "The page structure may have changed. Keeping existing pricing config."
    );
    process.exit(0);
  }

  // Check if anything changed
  const changed =
    rates.inputPerMTok !== config.rates.inputPerMTok ||
    rates.outputPerMTok !== config.rates.outputPerMTok ||
    rates.cacheCreationPerMTok !== config.rates.cacheCreationPerMTok ||
    rates.cacheReadPerMTok !== config.rates.cacheReadPerMTok;

  if (!changed) {
    console.log("Pricing is unchanged. Updating lastUpdated timestamp.");
  } else {
    console.log("Pricing has changed!");
    console.log(`  Input:  $${config.rates.inputPerMTok} → $${rates.inputPerMTok}/MTok`);
    console.log(`  Output: $${config.rates.outputPerMTok} → $${rates.outputPerMTok}/MTok`);
    console.log(
      `  Cache write: $${config.rates.cacheCreationPerMTok} → $${rates.cacheCreationPerMTok}/MTok`
    );
    console.log(
      `  Cache read:  $${config.rates.cacheReadPerMTok} → $${rates.cacheReadPerMTok}/MTok`
    );
  }

  const updated: PricingConfig = {
    model: config.model,
    lastUpdated: new Date().toISOString().split("T")[0],
    rates,
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log(`\nUpdated ${CONFIG_PATH}`);
}

main();
