/**
 * lib/email-template.ts — HTML email renderer for weekly marketing emails.
 *
 * Generates a self-contained HTML email with inline CSS and table-based layout
 * for maximum email client compatibility (Gmail, Outlook, Apple Mail).
 */

import { EMAIL_CONFIG } from "../emails/config";
import type { Product } from "./inventory";
import { getTotalQuantity, getTotalWeight } from "./inventory";

export interface EmailProduct {
  id: string;
  product: string;
  commodity: string;
  format: string;
  organic: boolean;
  packSize: string;
  origins: string[];
  totalQuantity: number;
  totalWeightLbs: number;
  unitType: string;
  warehouses: string[];
}

export interface EmailData {
  date: string;
  newArrivals: EmailProduct[];
  featured: EmailProduct[];
  formatGroups: Array<{
    format: string;
    productCount: number;
    totalWeightLbs: number;
  }>;
  stats: {
    totalProducts: number;
    totalWeightLbs: number;
    uniqueOrigins: number;
    uniqueWarehouses: number;
  };
  subject: string;
}

/** Convert a Product to the simplified EmailProduct shape. */
export function toEmailProduct(p: Product): EmailProduct {
  const origins = [...new Set(p.listings.map((l) => l.countryOfOrigin))];
  const warehouses = [...new Set(p.listings.map((l) => `${l.city}, ${l.state}`))];
  return {
    id: p.id,
    product: p.product,
    commodity: p.commodity,
    format: p.format,
    organic: p.organic,
    packSize: p.packSize,
    origins,
    totalQuantity: getTotalQuantity(p),
    totalWeightLbs: getTotalWeight(p),
    unitType: p.unitType,
    warehouses,
  };
}

/** Escape HTML special characters to prevent XSS in rendered email. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWeight(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M lbs`;
  if (lbs >= 1_000) return `${Math.round(lbs / 1_000).toLocaleString()}K lbs`;
  return `${lbs.toLocaleString()} lbs`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

const c = EMAIL_CONFIG.colors;
const layout = EMAIL_CONFIG.layout;

function productRow(p: EmailProduct, index: number): string {
  const bgColor = index % 2 === 0 ? c.white : c.grayLight;
  const typeBadge = p.organic
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">Organic</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3f4f6;color:#6b7280;">Conventional</span>`;
  return `
    <tr style="background:${bgColor};">
      <td style="padding:10px 12px;font-size:14px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};">
        <strong>${esc(p.product)}</strong><br/>
        <span style="font-size:12px;color:${c.textMuted};">${esc(p.packSize)}</span>
      </td>
      <td style="padding:10px 8px;font-size:13px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};text-align:center;">
        ${typeBadge}
      </td>
      <td style="padding:10px 8px;font-size:13px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};text-align:center;">
        ${p.origins.map(esc).join(", ")}
      </td>
      <td style="padding:10px 8px;font-size:13px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};text-align:right;">
        ${formatWeight(p.totalWeightLbs)}
      </td>
    </tr>`;
}

function highlightSection(
  title: string,
  items: EmailProduct[],
  accentColor: string,
  bgColor: string,
  borderColor: string,
): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (p) => `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:${c.textDark};">
        <strong>${esc(p.product)}</strong>
        ${p.organic ? '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600;background:#dcfce7;color:#166534;">Organic</span>' : ""}
      </td>
      <td style="padding:6px 0;font-size:13px;color:${c.textMuted};text-align:right;">
        ${esc(p.format)} &bull; ${p.origins.map(esc).join(", ")}
      </td>
    </tr>`,
    )
    .join("");
  return `
    <tr>
      <td style="padding:0 24px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${borderColor};border-radius:8px;background:${bgColor};overflow:hidden;">
          <tr>
            <td colspan="2" style="padding:12px 16px 8px;font-size:15px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;">
              &#9733; ${title}
            </td>
          </tr>
          ${rows}
          <tr><td colspan="2" style="padding:0 16px 12px;"></td></tr>
        </table>
      </td>
    </tr>`;
}

export function renderEmailHtml(data: EmailData): string {
  const { date, newArrivals, featured, formatGroups, stats, subject } = data;

  const newArrivalsHtml = highlightSection(
    "New Arrivals",
    newArrivals,
    c.green,
    c.greenBg,
    c.greenBorder,
  );

  const featuredHtml = highlightSection(
    "Featured Items",
    featured,
    c.blue,
    "#eff6ff",
    "#bfdbfe",
  );

  const formatRows = formatGroups
    .map(
      (g) => `
    <tr>
      <td style="padding:6px 16px;font-size:14px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};">
        <strong>${esc(g.format)}</strong>
      </td>
      <td style="padding:6px 16px;font-size:14px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};text-align:center;">
        ${g.productCount} product${g.productCount !== 1 ? "s" : ""}
      </td>
      <td style="padding:6px 16px;font-size:14px;color:${c.textDark};border-bottom:1px solid ${c.grayBorder};text-align:right;">
        ${formatWeight(g.totalWeightLbs)}
      </td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${esc(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td { font-family: ${layout.fontFamily}; }
    body { margin: 0; padding: 0; background-color: #f3f4f6; }
    img { border: 0; display: block; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <!-- Preheader text (hidden, shows in email preview) -->
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${stats.totalProducts} products available &bull; ${formatWeight(stats.totalWeightLbs)} total &bull; ${stats.uniqueOrigins} origins${newArrivals.length > 0 ? ` &bull; ${newArrivals.length} new arrival${newArrivals.length !== 1 ? "s" : ""}` : ""}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 0;">
        <!-- Email container -->
        <table class="email-container" role="presentation" width="${layout.maxWidth}" cellpadding="0" cellspacing="0" style="background:${c.white};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- HEADER -->
          <tr>
            <td style="background:${c.navy};padding:24px;text-align:center;">
              <img src="${EMAIL_CONFIG.logoUrl}" alt="${EMAIL_CONFIG.company.name}" width="180" style="display:inline-block;max-width:180px;height:auto;"/>
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td style="padding:24px 24px 8px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${c.navy};">Weekly Inventory Update</h1>
              <p style="margin:8px 0 0;font-size:14px;color:${c.textMuted};">
                ${date} &bull; ${formatNumber(stats.totalProducts)} products &bull; ${formatWeight(stats.totalWeightLbs)}
              </p>
            </td>
          </tr>

          <!-- STATS BAR -->
          <tr>
            <td style="padding:16px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:${c.grayLight};border-radius:6px;">
                <tr>
                  <td style="padding:12px;text-align:center;width:25%;">
                    <div style="font-size:20px;font-weight:700;color:${c.navy};">${formatNumber(stats.totalProducts)}</div>
                    <div style="font-size:11px;color:${c.textMuted};text-transform:uppercase;">Products</div>
                  </td>
                  <td style="padding:12px;text-align:center;width:25%;">
                    <div style="font-size:20px;font-weight:700;color:${c.navy};">${formatWeight(stats.totalWeightLbs)}</div>
                    <div style="font-size:11px;color:${c.textMuted};text-transform:uppercase;">Available</div>
                  </td>
                  <td style="padding:12px;text-align:center;width:25%;">
                    <div style="font-size:20px;font-weight:700;color:${c.navy};">${stats.uniqueOrigins}</div>
                    <div style="font-size:11px;color:${c.textMuted};text-transform:uppercase;">Origins</div>
                  </td>
                  <td style="padding:12px;text-align:center;width:25%;">
                    <div style="font-size:20px;font-weight:700;color:${c.navy};">${stats.uniqueWarehouses}</div>
                    <div style="font-size:11px;color:${c.textMuted};text-transform:uppercase;">Warehouses</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- NEW ARRIVALS -->
          ${newArrivalsHtml}

          <!-- FEATURED ITEMS -->
          ${featuredHtml}

          <!-- FORMAT SUMMARY -->
          <tr>
            <td style="padding:0 24px 16px;">
              <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:${c.navy};">Inventory by Category</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${c.grayBorder};border-radius:6px;overflow:hidden;">
                <tr style="background:${c.grayLight};">
                  <td style="padding:8px 16px;font-size:12px;font-weight:600;color:${c.textMuted};text-transform:uppercase;">Format</td>
                  <td style="padding:8px 16px;font-size:12px;font-weight:600;color:${c.textMuted};text-transform:uppercase;text-align:center;">Products</td>
                  <td style="padding:8px 16px;font-size:12px;font-weight:600;color:${c.textMuted};text-transform:uppercase;text-align:right;">Total Weight</td>
                </tr>
                ${formatRows}
              </table>
            </td>
          </tr>

          <!-- CTA BUTTON -->
          <tr>
            <td style="padding:8px 24px 24px;text-align:center;">
              <a href="${EMAIL_CONFIG.siteUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background:${c.navy};color:${c.white};font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
                View Full Inventory &#8594;
              </a>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 24px;">
              <hr style="border:none;border-top:1px solid ${c.grayBorder};margin:0;"/>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:${c.navy};">${EMAIL_CONFIG.company.name}</p>
              <p style="margin:0 0 12px;font-size:12px;color:${c.textMuted};line-height:1.5;">
                ${EMAIL_CONFIG.company.tagline}
              </p>
              <p style="margin:0;font-size:12px;color:${c.textMuted};">
                <a href="mailto:${EMAIL_CONFIG.company.email}" style="color:${c.blue};text-decoration:none;">${EMAIL_CONFIG.company.email}</a>
                &nbsp;&bull;&nbsp;${EMAIL_CONFIG.company.phone}
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email container -->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
