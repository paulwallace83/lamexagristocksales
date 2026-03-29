/**
 * lib/email-send.ts — Resend wrapper for marketing emails.
 *
 * Requires RESEND_API_KEY in .env.local.
 */

import { Resend } from "resend";
import { EMAIL_CONFIG } from "../emails/config";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set in environment variables");
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
  recipientCount: number;
}

/**
 * Send a marketing email via Resend.
 *
 * @param to - Array of recipient email addresses
 * @param subject - Email subject line
 * @param html - Rendered HTML email body
 */
export async function sendMarketingEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<SendResult> {
  if (to.length === 0) {
    return { success: false, error: "No recipients provided", recipientCount: 0 };
  }

  // Validate email addresses — RFC 5321 simplified: local@domain.tld
  // Rejects: missing TLD, consecutive dots, leading/trailing dots in local part, spaces
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const invalid = to.filter((e) => !emailRegex.test(e));
  if (invalid.length > 0) {
    const shown = invalid.slice(0, 5);
    const suffix = invalid.length > 5 ? ` and ${invalid.length - 5} more` : "";
    return {
      success: false,
      error: `Invalid email addresses: ${shown.join(", ")}${suffix}`,
      recipientCount: 0,
    };
  }

  try {
    const resend = getResend();

    // Resend supports up to 50 recipients per API call in the `to` field.
    // For larger lists, batch into groups of 50.
    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < to.length; i += batchSize) {
      batches.push(to.slice(i, i + batchSize));
    }

    let lastId: string | undefined;
    for (const batch of batches) {
      const { data, error } = await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: batch,
        subject,
        html,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          recipientCount: 0,
        };
      }
      lastId = data?.id;
    }

    return {
      success: true,
      id: lastId,
      recipientCount: to.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, recipientCount: 0 };
  }
}
