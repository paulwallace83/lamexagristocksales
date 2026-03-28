import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { TOOL_DEFINITIONS, executeTool, type FileData } from "@/lib/agent-tools";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an internal operations assistant for Lamex Agri Stock Sales. You help QA and operations staff manage inventory documentation and stock records. You are accessed only by authorised Lamex staff.

You have access to the inventory system and can:
- Search and query current inventory (products, lots, contracts, document status)
- Upload documents (COAs, test results, spec sheets, label photos, product photos) to the correct products/lots/contracts
- Move lots to the Discount & Clearance section and restore them back
- Answer questions about current stock levels and document coverage
- View items pending in the import review queue

RULES — follow these exactly:
1. Always confirm before any action. Describe exactly what you are about to do and wait for explicit approval ("yes", "go ahead", "do it") before calling upload_document, create_discount_item, or restore_discount_item.
2. When a file is uploaded, read it carefully. State your confidence and reasoning before proposing any action.
3. COA matching: extract all lot numbers from the document. Search each using get_lot_by_number. List every match found. Propose uploading to all matched lots. Wait for confirmation.
4. Spec sheet / label matching: look for a contract number in the document, then use get_contract_info. If no contract number is visible, search by product name. List candidates with confidence. Wait for confirmation.
5. Product photo matching: IQF and frozen products only. Politely decline photo uploads for Juice Concentrate or Puree products and explain the rule.
6. Do not discuss customer names (none exist in this system), regular inventory pricing, or internal ERP references.
7. You cannot modify code or system configuration. Refer code questions to the developer.`;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
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
    apiMessages = parsed;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid messages format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Process uploaded files — build file map and content blocks
  const fileMap = new Map<string, FileData>();
  const fileContentBlocks: Anthropic.ContentBlockParam[] = [];

  for (const file of uploadedFiles) {
    if (file.size > MAX_FILE_SIZE || !ALLOWED_MIME_TYPES.has(file.type)) continue;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    fileMap.set(safeName, { buffer, mimeType: file.type, name: file.name });

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

  // Attach file content blocks to the last user message of this turn
  if (fileContentBlocks.length > 0 && apiMessages.length > 0) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg.role === "user") {
      const existing =
        typeof lastMsg.content === "string"
          ? [{ type: "text" as const, text: lastMsg.content }]
          : (lastMsg.content as Anthropic.ContentBlockParam[]);
      lastMsg.content = [...existing, ...fileContentBlocks];
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

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS,
            messages,
          });

          // Emit text blocks
          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              send({ type: "text", text: block.text });
            }
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

        send({ type: "done" });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", message: errorMsg });
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
