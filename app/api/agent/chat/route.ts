import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { auth } from "@/lib/auth";
import { TOOL_DEFINITIONS, executeTool, type FileData } from "@/lib/agent-tools";
import { recordUsage, calculateCost } from "@/lib/api-usage";
import { getAgentTempRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

const AGENT_TEMP_DIR = getAgentTempRoot();
const TEMP_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Top Dog Paul's AI Brain (TDPAIB) — an internal operations assistant for Lamex Agri Stock Sales. You help QA and operations staff manage inventory documentation and stock records. You are accessed only by authorised Lamex staff.

You have access to the inventory system and can:
- Search and query current inventory (products, lots, contracts, document status)
- Upload documents (COAs, test results, spec sheets, label photos, product photos) to the correct products/lots/contracts
- Move lots to the Discount & Clearance section and restore them back
- Answer questions about current stock levels and document coverage
- View items pending in the import review queue
- Check for new arrivals and clear new-arrival flags
- Support the weekly sync workflow: read reference data, save proposed inventory, run the sync diff, dry-run validation, apply approved syncs, and generate reconciliation reports

RULES — follow these exactly:
1. Always confirm before any action. Describe exactly what you are about to do and wait for explicit approval ("yes", "go ahead", "do it") before calling upload_document, batch_upload_documents, create_discount_item, restore_discount_item, save_coa_data, backfill_coa_data, clear_new_arrivals, save_proposed_inventory, apply_sync, or import_inventory_file.
2. When a file is uploaded, read it carefully. State your confidence and reasoning before proposing any action.
3. COA matching: extract all lot numbers from the document. For a single file, use get_lot_by_number. For multiple files, use batch_lot_lookup with all lot numbers at once. List every match found. Propose uploading to all matched lots. Wait for confirmation.
4. Test result recognition: The key distinction is WHO issued the document. A COA comes from the supplier/manufacturer. A test result comes from an independent third-party laboratory (SGS, Eurofins, GFL, Bureau Veritas, etc.). Even if the filename says "COA", if the document is issued by a third-party lab, it is a "test-results" document. Match test results to lots the same way as COAs (extract lot numbers, search, confirm). Category must be "test-results" when uploading. EXCEPTION: If a supplier's COA itself contains heavy metal or pesticide results within it, upload it as "coa" (it's still the supplier's certificate) and note to the user that the test data is included on the COA. Expected test results per product type: every Juice Concentrate lot should have a heavy metal test, and every Organic product lot should have a pesticide test.
5. Spec sheet / label matching: look for a contract number in the document, then use get_contract_info. If no contract number is visible, search by product name. List candidates with confidence. Wait for confirmation.
6. Product photo matching: IQF and frozen products only. Politely decline photo uploads for Juice Concentrate or Puree products and explain the rule.
7. Do not discuss customer names (none exist in this system), regular inventory pricing, or internal ERP references.
8. You cannot modify code or system configuration. Refer code questions to the developer.
9. If a tool returns an error (any response containing an "error" field), you MUST immediately tell the user what failed. Never report success when a tool returned an error.
10. COA data is automatically extracted on upload via Claude vision. If extraction missed values or got them wrong, use save_coa_data to correct or add data. When reviewing a COA manually, you can also use save_coa_data to enter key aspects (brix, acidity, color, clarity, ratio, defects, overripe, underripe, NTU, or any other measurable parameter). Each value must be a single figure — never a range.
11. Batch document upload: When the user attaches MULTIPLE files at once:
    a. Read ALL files first. For each file, extract lot numbers or contract numbers.
    b. Use batch_lot_lookup with ALL extracted lot numbers in a single call (do NOT call get_lot_by_number individually for each file).
    c. If some files have no lot match, use search_inventory or get_contract_info as needed (minimize tool calls).
    d. Present a SINGLE consolidated table to the user showing: File | Category | Product | Lot(s) / Contract | Confidence. Include any files that could not be matched with a "No match" row.
    e. Wait for the user to confirm the ENTIRE table (or correct specific rows).
    f. After confirmation, call batch_upload_documents with ALL confirmed files in a single call.
    g. Report the consolidated results: how many succeeded, any failures with reasons.
    For single-file uploads, continue using the individual get_lot_by_number and upload_document tools.
12. COA data backfill: When the user asks to backfill, re-extract, or scan for missing COA data, first call get_coa_backfill_status to show the scope (how many documents and lots need extraction). Present the summary grouped by product, then wait for explicit confirmation before calling backfill_coa_data. If the user wants to limit to specific lots, pass their lot numbers in the lotNumbers parameter.
13. Post-sync new arrivals: After a successful apply_sync that includes new arrivals, or when the user asks about new arrivals, call get_new_arrivals. If there are new arrivals, present the list with product names and suggest: "You can send a marketing email highlighting these new arrivals at [Open Email Composer](/admin/email), or I can clear the new-arrival flags if you'd prefer not to send." If the user wants to dismiss, confirm and then call clear_new_arrivals.
14. Weekly sync workflow: The user provides inventory data either by uploading a CSV/Excel file (preferred) or by pasting pivot table data.
    FILE UPLOAD PATH (preferred — use this when the user attaches a .csv, .xlsx, or .xls file):
    a. The user uploads an ERP export file. Confirm you will import it using import_inventory_file, then call it with the filename.
    b. Present the import stats: total rows, included products/listings/weight, hard-excluded count, soft-excluded count, and any warnings.
    c. If there are soft-excluded items, present the review summary and ask if any should be included (they can also review at /review).
    d. Call run_sync_diff to generate and present the diff report.
    PASTE PATH (fallback — use this when the user pastes raw pivot table text):
    a. Call get_reference_data to load supplier and warehouse lookup tables.
    b. Parse the pasted pivot data following the row structure: Row 1 = stock description, Row 2 = warehouse location, Row 3 = customer name (ALWAYS STRIP — never include in output), Row 4 = supplier + contract number.
    c. Resolve each supplier's country of origin and each warehouse's city/state using the reference data. Flag any unresolved suppliers or warehouses and ask the user.
    d. Build the structured products array. Confirm the parsed inventory with the user (show product count, total weight, any issues found).
    e. After user confirmation, call save_proposed_inventory with the parsed products.
    f. Call run_sync_diff to generate and present the diff report.
    COMMON STEPS (both paths continue here):
    g. Help the user resolve any warnings (missing COO, unknown warehouses, invalid unit types).
    g2. If the user seems uncertain or wants to verify before committing, suggest calling dry_run_sync. It validates everything without writing any data — no confirmation needed. Present the dry-run counts to reassure the user.
    h. Once all blocking warnings are resolved and the user approves, call apply_sync. Before calling, summarise what it will do: "This will snapshot the current inventory, replace it with the proposed data, re-seed the database, re-link documents and COA data, and deduct discount lots." Wait for explicit confirmation.
    i. After apply_sync succeeds, immediately call get_reconciliation and present the per-product quantity/weight table. Tell the user to cross-check these figures against the raw ERP data.
    j. The sync is NOT complete until the user explicitly confirms the reconciliation figures match the ERP. Do not proceed to any other action or mark the sync as done until sign-off.`;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

// MIME types that Claude can render as content blocks (PDF, images).
// Spreadsheets are only accessed via fileMap by tools — not sent to Claude.
const RENDERABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_ITERATIONS = 10;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "qa" && session.user.role !== "reviewer")
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messagesRaw = formData.get("messages") as string | null;
  const uploadedFiles = formData.getAll("files") as File[];

  let apiMessages: Anthropic.MessageParam[];
  try {
    const parsed = JSON.parse(messagesRaw || "[]");
    if (!Array.isArray(parsed)) throw new Error("messages must be an array");
    // Strip any extra fields (e.g. fileNames from conversation persistence)
    // that would cause Anthropic API validation errors
    apiMessages = parsed.map((m: Record<string, unknown>) => ({
      role: m.role,
      content: m.content,
    })) as Anthropic.MessageParam[];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid messages format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-user temp directory for file persistence across conversation turns
  const userHash = (session.user!.email || "anon").replace(/[^a-zA-Z0-9]/g, "_");
  const userTempDir = join(AGENT_TEMP_DIR, userHash);
  mkdirSync(userTempDir, { recursive: true });

  // Clean stale files (>30 min old)
  try {
    for (const f of readdirSync(userTempDir)) {
      const fp = join(userTempDir, f);
      try {
        if (Date.now() - statSync(fp).mtimeMs > TEMP_MAX_AGE_MS) unlinkSync(fp);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Process uploaded files — build file map and content blocks
  const fileMap = new Map<string, FileData>();
  const fileContentBlocks: Anthropic.ContentBlockParam[] = [];
  const nonRenderableFileNames: string[] = [];

  for (const file of uploadedFiles) {
    if (file.size > MAX_FILE_SIZE || !ALLOWED_MIME_TYPES.has(file.type)) continue;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    fileMap.set(safeName, { buffer, mimeType: file.type, name: file.name });

    // Persist to user-scoped temp so the file survives across conversation turns
    const metaPath = join(userTempDir, `${safeName}.json`);
    const dataPath = join(userTempDir, safeName);
    if (resolve(dataPath).startsWith(resolve(userTempDir) + "/")) {
      writeFileSync(dataPath, buffer);
      writeFileSync(metaPath, JSON.stringify({ mimeType: file.type, name: file.name }));
    }

    // Only build content blocks for types Claude can render (PDF, images).
    // Spreadsheets are accessed by tools via fileMap — not sent to Claude.
    if (!RENDERABLE_MIME_TYPES.has(file.type)) {
      nonRenderableFileNames.push(file.name);
      continue;
    }

    const base64 = buffer.toString("base64");

    if (file.type === "application/pdf") {
      fileContentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as unknown as Anthropic.ContentBlockParam);
    } else if (file.type.startsWith("image/")) {
      fileContentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64,
        },
      });
    }
  }

  // Load previously uploaded files from user's temp dir (for follow-up turns)
  try {
    for (const f of readdirSync(userTempDir)) {
      if (f.endsWith(".json")) continue;
      const safeName = f;
      if (fileMap.has(safeName)) continue;
      const metaPath = join(userTempDir, `${safeName}.json`);
      const dataPath = join(userTempDir, safeName);
      if (existsSync(metaPath) && existsSync(dataPath)) {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
        fileMap.set(safeName, {
          buffer: readFileSync(dataPath),
          mimeType: meta.mimeType,
          name: meta.name,
        });
      }
    }
  } catch { /* ignore */ }

  // Attach file content blocks and non-renderable file hints to the last user message
  if ((fileContentBlocks.length > 0 || nonRenderableFileNames.length > 0) && apiMessages.length > 0) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg.role === "user") {
      const existing =
        typeof lastMsg.content === "string"
          ? [{ type: "text" as const, text: lastMsg.content }]
          : (lastMsg.content as Anthropic.ContentBlockParam[]);
      const extras: Anthropic.ContentBlockParam[] = [...fileContentBlocks];
      // Tell Claude about uploaded spreadsheets it can't see directly
      if (nonRenderableFileNames.length > 0) {
        extras.push({
          type: "text" as const,
          text: `[Uploaded file${nonRenderableFileNames.length > 1 ? "s" : ""}: ${nonRenderableFileNames.join(", ")}. Use the import_inventory_file tool to process.]`,
        });
      }
      lastMsg.content = [...existing, ...extras];
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        let messages = [...apiMessages];
        let iteration = 0;

        // Token usage accumulators (summed across all tool-loop iterations)
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheCreation = 0;
        let totalCacheRead = 0;

        for (; iteration < MAX_ITERATIONS; iteration++) {
          const apiStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS,
            messages,
          });

          // Stream text deltas to client as they arrive
          apiStream.on("text", (textDelta) => {
            send({ type: "text", text: textDelta });
          });

          const response = await apiStream.finalMessage();

          // Accumulate token usage from this iteration
          if (response.usage) {
            totalInputTokens += response.usage.input_tokens ?? 0;
            totalOutputTokens += response.usage.output_tokens ?? 0;
            const usage = response.usage as unknown as Record<string, number | null>;
            totalCacheCreation += usage.cache_creation_input_tokens ?? 0;
            totalCacheRead += usage.cache_read_input_tokens ?? 0;
          }

          // Collect tool use blocks
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
            break;
          }

          // Execute tools sequentially and collect results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            send({ type: "tool_start", name: block.name, input: block.input });
            try {
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                fileMap,
                session.user!.email || "agent",
                session.user!.role,
              );
              send({ type: "tool_result", name: block.name, result });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : "Unknown error";
              send({ type: "tool_result", name: block.name, result: { error: errorMsg } });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ error: errorMsg }),
              });
            }
          }

          messages = [
            ...messages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults },
          ];
        }

        if (iteration >= MAX_ITERATIONS) {
          send({
            type: "warning",
            message:
              "I reached the maximum number of steps for this request. The response may be incomplete — send a follow-up message to continue.",
          });
        }

        // Record usage to database and send to client
        const iterationCount = iteration + 1;
        const cost = calculateCost({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheCreationTokens: totalCacheCreation,
          cacheReadTokens: totalCacheRead,
        });

        try {
          recordUsage({
            userEmail: session.user!.email || "unknown",
            model: "claude-sonnet-4-6",
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheCreationTokens: totalCacheCreation,
            cacheReadTokens: totalCacheRead,
            iterations: iterationCount,
          });
        } catch (err) {
          console.error("[agent] Failed to record usage:", err);
        }

        send({
          type: "usage",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          iterations: iterationCount,
          cost,
        });

        send({ type: "done" });
      } catch (err) {
        console.error("[agent] Stream error:", err);
        send({ type: "error", message: "Something went wrong processing your request. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
