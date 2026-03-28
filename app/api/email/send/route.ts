import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getInventory, getInventoryStats } from "@/lib/inventory-db";
import { getFlaggedProductIds } from "@/lib/product-flags";
import { renderEmailHtml, toEmailProduct, type EmailData } from "@/lib/email-template";
import { getTotalWeight } from "@/lib/inventory";
import { sendMarketingEmail } from "@/lib/email-send";
import { EMAIL_CONFIG } from "@/emails/config";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 200;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "reviewer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { recipients, subject } = body as { recipients?: string; subject?: string };

  if (!recipients || typeof recipients !== "string" || recipients.trim().length === 0) {
    return NextResponse.json({ error: "No recipients provided" }, { status: 400 });
  }

  // Cap raw input size to prevent abuse (200 emails × ~50 chars each = ~10KB max)
  if (recipients.length > 15_000) {
    return NextResponse.json({ error: "Recipients input too large" }, { status: 400 });
  }

  // Parse and deduplicate recipients
  const to = [
    ...new Set(
      recipients
        .split(/[,\n]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];

  if (to.length === 0) {
    return NextResponse.json({ error: "No valid recipients after parsing" }, { status: 400 });
  }
  if (to.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (max ${MAX_RECIPIENTS})` },
      { status: 400 },
    );
  }

  const emailSubject = (subject && typeof subject === "string" && subject.trim().length > 0)
    ? subject.trim().slice(0, 200)
    : EMAIL_CONFIG.defaultSubject;

  // Build email data
  const { products } = getInventory();
  const stats = getInventoryStats();
  const newArrivalIds = getFlaggedProductIds("new_arrival");
  const featuredIds = getFlaggedProductIds("featured");

  const emailProducts = products.map(toEmailProduct);
  const newArrivals = emailProducts.filter((p) => newArrivalIds.has(p.id));
  const featured = emailProducts.filter((p) => featuredIds.has(p.id));

  const formatOrder = ["IQF", "Juice Concentrate", "Puree"];
  const formatMap = new Map<string, { count: number; weight: number }>();
  for (const p of products) {
    const entry = formatMap.get(p.format) ?? { count: 0, weight: 0 };
    entry.count++;
    entry.weight += getTotalWeight(p);
    formatMap.set(p.format, entry);
  }
  const formatGroups = formatOrder
    .filter((f) => formatMap.has(f))
    .map((f) => ({
      format: f,
      productCount: formatMap.get(f)!.count,
      totalWeightLbs: formatMap.get(f)!.weight,
    }));

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const data: EmailData = {
    date: today,
    newArrivals,
    featured,
    formatGroups,
    stats: {
      totalProducts: stats.totalProducts,
      totalWeightLbs: stats.totalWeightLbs,
      uniqueOrigins: stats.uniqueOrigins,
      uniqueWarehouses: stats.uniqueWarehouses,
    },
    subject: emailSubject,
  };

  const html = renderEmailHtml(data);
  const result = await sendMarketingEmail(to, emailSubject, html);

  if (!result.success) {
    console.error("[email/send] Send failed:", result.error);
    // Sanitize error — don't leak Resend API internals to client
    const safeError = result.error?.includes("RESEND_API_KEY")
      ? "Email service is not configured. Contact the administrator."
      : result.error?.includes("Invalid")
        ? result.error
        : "Failed to send email. Please try again or contact the administrator.";
    return NextResponse.json({ error: safeError }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: result.id,
    recipientCount: result.recipientCount,
    subject: emailSubject,
  });
}
