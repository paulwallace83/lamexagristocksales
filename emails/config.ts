/**
 * emails/config.ts — Branding constants for marketing emails.
 */

export const EMAIL_CONFIG = {
  /** From address (must be verified in Resend) */
  from: "Lamex Agri Foods <inventory@lamexfoods.us>",

  /** Default subject line */
  defaultSubject: "Lamex Agri Foods — Weekly Inventory Update",

  /** Public site URL for CTA links. Override via NEXT_PUBLIC_SITE_URL env var. */
  get siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || "https://inventory.lamexfoods.us";
  },

  /** Brand colors */
  colors: {
    navy: "#1a2b5f",
    navyLight: "#243f75",
    blue: "#4a90c4",
    green: "#16a34a",
    greenBg: "#f0fdf4",
    greenBorder: "#bbf7d0",
    amber: "#d97706",
    amberBg: "#fffbeb",
    amberBorder: "#fde68a",
    gray: "#6b7280",
    grayLight: "#f9fafb",
    grayBorder: "#e5e7eb",
    white: "#ffffff",
    textDark: "#111827",
    textMuted: "#6b7280",
  },

  /** Logo URLs — these must be absolute URLs pointing to the hosted site */
  get logoUrl(): string {
    return `${this.siteUrl}/assets/logo-agri-foods.png`;
  },

  /** Company info */
  company: {
    name: "Lamex Agri Foods",
    tagline: "Global sourcing of processed fruits and vegetables. Over 60 years serving the food industry.",
    email: "sales@lamexfoods.us",
    phone: "(201) 440-4004",
  },

  /** Email layout */
  layout: {
    maxWidth: 600,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
} as const;
