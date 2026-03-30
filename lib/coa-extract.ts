/**
 * lib/coa-extract.ts — Automatic COA key aspects extraction using Claude vision.
 *
 * Sends uploaded COA documents (PDF or image) to Claude Haiku for
 * cost-efficient extraction of measurable parameters like brix, acidity,
 * color, defects, etc. Works on both text-based PDFs and scanned images.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CoaFields } from "./coa-data";

const MODEL = "claude-haiku-4-5-20251001";

const EXTRACTION_PROMPT = `You are a COA (Certificate of Analysis) data extractor for processed fruit and vegetable products.

Analyze this document and extract all measurable parameters as a flat JSON object.

Rules:
- Each value must be a single number or short string — never a range, never "N/A"
- Use lowercase snake_case keys (e.g., "brix", "acidity", "color", "ntu")
- Common fields: brix, acidity, ratio, color, clarity, ntu, defects, overripe, underripe, ph, moisture, viscosity, density, mesh_size, tpc, yeast_mold, coliform
- Include ANY measurable parameter you find, not just the common ones
- For numeric values, return the number (e.g., 11.5 not "11.5 Bx")
- For text values like color or clarity, return a short description (e.g., "Light Amber", "Clear")
- For percentage values like defects, return just the number (e.g., 2.3 not "2.3%")
- If you cannot clearly read a value, omit it entirely
- Return ONLY a JSON object, no other text

Example output:
{"brix": 11.5, "acidity": 1.2, "ratio": 9.6, "color": "Light Amber", "ntu": 0.8, "ph": 3.4}`;

/**
 * Extract COA key aspects from a document using Claude vision.
 * Returns null if extraction fails (caller should treat as non-blocking).
 */
export async function extractCoaData(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<CoaFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("COA extraction skipped: ANTHROPIC_API_KEY not set");
    return null;
  }

  // Only process supported media types for vision
  const supportedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!supportedTypes.includes(mimeType)) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const base64Data = fileBuffer.toString("base64");

    // PDFs use "document" content block; images use "image" content block
    const contentBlock: Anthropic.ContentBlockParam =
      mimeType === "application/pdf"
        ? {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: base64Data,
            },
          }
        : {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64Data,
            },
          };

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    // Parse JSON — handle markdown code fences
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    // Validate: only keep finite numbers and bounded strings, strip non-alphanumeric keys
    const fields: CoaFields = {};
    let fieldCount = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (fieldCount >= 50) break;
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!normalizedKey || normalizedKey.length > 50) continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        fields[normalizedKey] = value;
        fieldCount++;
      } else if (typeof value === "string" && value.length <= 500) {
        fields[normalizedKey] = value;
        fieldCount++;
      }
    }

    return Object.keys(fields).length > 0 ? fields : null;
  } catch (err) {
    console.error("COA extraction failed:", {
      error: err instanceof Error ? err.message : String(err),
      mimeType,
    });
    return null;
  }
}
