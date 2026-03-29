import { join } from "path";

/**
 * Root directory for persistent data (database, uploads, agent temp files).
 *
 * On Railway: set RAILWAY_VOLUME_PATH to a mounted persistent volume (e.g. /app/data-persist).
 * Locally: defaults to process.cwd() (project root).
 */
export function getDataDir(): string {
  return process.env.RAILWAY_VOLUME_PATH || process.cwd();
}

/** Absolute path to the SQLite database file. */
export function getDbPath(): string {
  return join(getDataDir(), "lamex.db");
}

/**
 * Root directory for uploaded documents (COAs, specs, labels, photos).
 *
 * On Railway: {RAILWAY_VOLUME_PATH}/uploads
 * Locally: {cwd}/public/uploads (Next.js static serving directory)
 */
export function getUploadsRoot(): string {
  if (process.env.RAILWAY_VOLUME_PATH) {
    return join(process.env.RAILWAY_VOLUME_PATH, "uploads");
  }
  return join(process.cwd(), "public", "uploads");
}

/** Root directory for agent temp files (per-user upload staging). */
export function getAgentTempRoot(): string {
  return join(getDataDir(), ".agent-uploads");
}
