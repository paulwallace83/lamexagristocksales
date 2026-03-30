/**
 * lib/document-request-emails.ts — Email functions for document request workflow.
 */

import { sendMarketingEmail, sendEmailWithAttachments } from "./email-send";
import { getDocumentRequestById } from "./document-requests";
import type { DocumentRequest } from "./document-requests";
import { EMAIL_CONFIG } from "../emails/config";

const c = EMAIL_CONFIG.colors;
const layout = EMAIL_CONFIG.layout;
const COA_NOTIFICATION_EMAIL = "coa@lamexfoods.us";
const SALES_NOTIFICATION_EMAIL = "sales@lamexfoods.us";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send notification email to sales when a product enquiry is submitted.
 */
export async function sendSalesNotification(data: {
  productName: string;
  requesterName: string;
  requesterCompany: string;
  requesterEmail: string;
  requesterPhone?: string;
  message?: string;
  hasDocumentRequest: boolean;
}) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Product Enquiry</title></head>
<body style="margin:0;padding:0;background:${c.grayLight};font-family:${layout.fontFamily};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.grayLight};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="${layout.maxWidth}" cellpadding="0" cellspacing="0" style="background:${c.white};border-radius:8px;overflow:hidden;border:1px solid ${c.grayBorder};">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${c.navy},${c.navyLight});padding:24px 32px;">
  <img src="${EMAIL_CONFIG.logoUrl}" alt="Lamex Agri Foods" width="180" style="display:block;margin-bottom:12px;"/>
  <h1 style="color:${c.white};font-size:20px;margin:0;">New Product Enquiry</h1>
</td></tr>

<!-- Body -->
<tr><td style="padding:24px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;width:100px;">Product</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;font-weight:600;">${escapeHtml(data.productName)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Name</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(data.requesterName)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Company</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(data.requesterCompany)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Email</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;"><a href="mailto:${escapeHtml(data.requesterEmail)}" style="color:${c.blue};">${escapeHtml(data.requesterEmail)}</a></td></tr>
    ${data.requesterPhone ? `<tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Phone</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(data.requesterPhone)}</td></tr>` : ""}
  </table>

  ${data.message ? `
  <h3 style="color:${c.navy};font-size:14px;margin:0 0 8px;">Message</h3>
  <div style="background:${c.grayLight};border:1px solid ${c.grayBorder};border-radius:6px;padding:12px 16px;font-size:13px;color:${c.textDark};line-height:1.6;">
    ${escapeHtml(data.message)}
  </div>` : ""}

  ${data.hasDocumentRequest ? `
  <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:12px 16px;margin-top:16px;">
    <p style="color:#065f46;font-size:13px;margin:0;">
      This customer also requested product documents (COA, test results, or spec sheets). The QA team has been notified separately.
    </p>
  </div>` : ""}
</td></tr>

<!-- Footer -->
<tr><td style="background:${c.grayLight};padding:16px 32px;border-top:1px solid ${c.grayBorder};">
  <p style="color:${c.textMuted};font-size:12px;margin:0;text-align:center;">
    ${EMAIL_CONFIG.company.name} | ${EMAIL_CONFIG.company.phone} | ${EMAIL_CONFIG.company.email}
  </p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  const rawSubject = `Product Enquiry: ${data.productName} — ${data.requesterCompany}`;
  const subject = rawSubject.length > 200 ? rawSubject.slice(0, 197) + "..." : rawSubject;
  await sendMarketingEmail([SALES_NOTIFICATION_EMAIL], subject, html);
}

/**
 * Send notification email to QA when a new document request is submitted.
 */
export async function sendRequestNotification(requestId: number) {
  const request = getDocumentRequestById(requestId);
  if (!request) return;

  const siteUrl = EMAIL_CONFIG.siteUrl;
  const reviewUrl = `${siteUrl}/admin/requests/${request.id}`;

  // Summarize requested docs (escape user-supplied lot/contract values)
  const docSummary = request.requestedDocs
    .map((item) => {
      const ref = item.lotNumber
        ? `Lot ${escapeHtml(item.lotNumber)}`
        : `Contract ${escapeHtml(item.baseContract || "")}`;
      return `${ref}: ${item.categories.map((c) => escapeHtml(c).toUpperCase()).join(", ")}`;
    })
    .join("<br/>");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Document Request</title></head>
<body style="margin:0;padding:0;background:${c.grayLight};font-family:${layout.fontFamily};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.grayLight};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="${layout.maxWidth}" cellpadding="0" cellspacing="0" style="background:${c.white};border-radius:8px;overflow:hidden;border:1px solid ${c.grayBorder};">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${c.navy},${c.navyLight});padding:24px 32px;">
  <img src="${EMAIL_CONFIG.logoUrl}" alt="Lamex Agri Foods" width="180" style="display:block;margin-bottom:12px;"/>
  <h1 style="color:${c.white};font-size:20px;margin:0;">New Document Request</h1>
</td></tr>

<!-- Body -->
<tr><td style="padding:24px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;width:100px;">Product</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;font-weight:600;">${escapeHtml(request.productName)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Name</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(request.requesterName)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Company</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(request.requesterCompany)}</td></tr>
    <tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Email</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;"><a href="mailto:${escapeHtml(request.requesterEmail)}" style="color:${c.blue};">${escapeHtml(request.requesterEmail)}</a></td></tr>
    ${request.requesterPhone ? `<tr><td style="padding:6px 0;color:${c.textMuted};font-size:13px;">Phone</td>
        <td style="padding:6px 0;color:${c.textDark};font-size:14px;">${escapeHtml(request.requesterPhone)}</td></tr>` : ""}
  </table>

  <h3 style="color:${c.navy};font-size:14px;margin:0 0 8px;">Requested Documents</h3>
  <div style="background:${c.grayLight};border:1px solid ${c.grayBorder};border-radius:6px;padding:12px 16px;font-size:13px;color:${c.textDark};line-height:1.6;">
    ${docSummary}
  </div>

  ${request.message ? `
  <h3 style="color:${c.navy};font-size:14px;margin:20px 0 8px;">Message</h3>
  <div style="background:${c.grayLight};border:1px solid ${c.grayBorder};border-radius:6px;padding:12px 16px;font-size:13px;color:${c.textDark};line-height:1.6;">
    ${escapeHtml(request.message)}
  </div>` : ""}

  <!-- CTA -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
  <tr><td align="center">
    <a href="${reviewUrl}" style="display:inline-block;background:${c.navy};color:${c.white};font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
      Review Request
    </a>
  </td></tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="background:${c.grayLight};padding:16px 32px;border-top:1px solid ${c.grayBorder};">
  <p style="color:${c.textMuted};font-size:12px;margin:0;text-align:center;">
    ${EMAIL_CONFIG.company.name} | ${EMAIL_CONFIG.company.phone} | ${EMAIL_CONFIG.company.email}
  </p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  const subject = `Document Request: ${request.productName} — ${request.requesterCompany}`;
  await sendMarketingEmail([COA_NOTIFICATION_EMAIL], subject, html);
}

/**
 * Send approved documents to the customer as email attachments.
 */
export async function sendApprovalEmail(
  request: DocumentRequest,
  attachments: Array<{ filename: string; content: Buffer }>
) {
  const fileList = attachments
    .map((a) => `<li style="padding:4px 0;color:${c.textDark};font-size:13px;">${escapeHtml(a.filename)}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Your Requested Documents</title></head>
<body style="margin:0;padding:0;background:${c.grayLight};font-family:${layout.fontFamily};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.grayLight};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="${layout.maxWidth}" cellpadding="0" cellspacing="0" style="background:${c.white};border-radius:8px;overflow:hidden;border:1px solid ${c.grayBorder};">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${c.navy},${c.navyLight});padding:24px 32px;">
  <img src="${EMAIL_CONFIG.logoUrl}" alt="Lamex Agri Foods" width="180" style="display:block;margin-bottom:12px;"/>
  <h1 style="color:${c.white};font-size:20px;margin:0;">Your Requested Documents</h1>
</td></tr>

<!-- Body -->
<tr><td style="padding:24px 32px;">
  <p style="color:${c.textDark};font-size:14px;line-height:1.6;margin:0 0 16px;">
    Dear ${escapeHtml(request.requesterName)},
  </p>
  <p style="color:${c.textDark};font-size:14px;line-height:1.6;margin:0 0 16px;">
    Thank you for your interest in <strong>${escapeHtml(request.productName)}</strong>.
    Please find the requested documents attached to this email.
  </p>

  ${request.notes ? `
  <div style="background:${c.grayLight};border-left:4px solid ${c.navy};padding:12px 16px;margin:0 0 16px;border-radius:0 6px 6px 0;">
    <p style="color:${c.textMuted};font-size:12px;margin:0 0 4px;font-weight:600;">Note from our team:</p>
    <p style="color:${c.textDark};font-size:13px;margin:0;line-height:1.5;">${escapeHtml(request.notes)}</p>
  </div>` : ""}

  <h3 style="color:${c.navy};font-size:14px;margin:0 0 8px;">Attached Documents</h3>
  <ul style="margin:0 0 20px;padding-left:20px;">${fileList}</ul>

  <p style="color:${c.textDark};font-size:14px;line-height:1.6;margin:0 0 16px;">
    If you have any questions or need additional information, please don&#39;t hesitate to reach out.
  </p>

  <!-- CTA -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">
    <a href="${EMAIL_CONFIG.siteUrl}/contact?productId=${encodeURIComponent(request.productId)}&product=${encodeURIComponent(request.productName)}" style="display:inline-block;background:${c.navy};color:${c.white};font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
      Request a Quote
    </a>
  </td></tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="background:${c.grayLight};padding:16px 32px;border-top:1px solid ${c.grayBorder};">
  <p style="color:${c.textMuted};font-size:12px;margin:0;text-align:center;">
    ${EMAIL_CONFIG.company.name} | ${EMAIL_CONFIG.company.phone} | ${EMAIL_CONFIG.company.email}
  </p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  const subject = `Your Document Request — ${request.productName} | Lamex Agri Foods`;
  return sendEmailWithAttachments([request.requesterEmail], subject, html, attachments);
}
