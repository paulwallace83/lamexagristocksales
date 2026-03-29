import { join } from "path";
import { existsSync } from "fs";

/**
 * Root directory for persistent data (database, uploads, agent temp files).
 *
 * On Railway: set RAILWAY_VOLUME_PATH to a mounted persistent volume (e.g. /app/data-persist).
 * Falls back to process.cwd() if the volume path doesn't exist (e.g. during build).
 * Locally: defaults to process.cwd() (project root).
 */
export function getDataDir(): string {
  const vol = process.env.RAILWAY_VOLUME_PATH;
  if (vol && existsSync(vol)) return vol;
  return process.cwd();
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
  const vol = process.env.RAILWAY_VOLUME_PATH;
  if (vol && existsSync(vol)) {
    return join(vol, "uploads");
  }
  return join(process.cwd(), "public", "uploads");
}

/** Root directory for agent temp files (per-user upload staging). */
export function getAgentTempRoot(): string {
  return join(getDataDir(), ".agent-uploads");
}
