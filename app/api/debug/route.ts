import { NextResponse } from "next/server";
import { existsSync, readdirSync, cpSync } from "fs";
import { join } from "path";
import { getDataDir, getDbPath, getUploadsRoot } from "@/lib/paths";

export async function GET() {
  const vol = process.env.RAILWAY_VOLUME_PATH;
  const dataDir = getDataDir();
  const dbPath = getDbPath();
  const uploadsRoot = getUploadsRoot();
  const cwd = process.cwd();

  let volContents: string[] = [];
  if (vol && existsSync(vol)) {
    try { volContents = readdirSync(vol); } catch { /* ignore */ }
  }

  let dataContents: string[] = [];
  const dataPath = join(cwd, "data");
  if (existsSync(dataPath)) {
    try { dataContents = readdirSync(dataPath); } catch { /* ignore */ }
  }

  const uploadsExist = existsSync(uploadsRoot);
  const publicUploadsExist = existsSync(join(cwd, "public", "uploads"));

  // One-time copy: if volume exists but uploads aren't there yet, copy them
  let copyResult = "not needed";
  if (vol && existsSync(vol) && publicUploadsExist && !uploadsExist) {
    try {
      cpSync(join(cwd, "public", "uploads"), join(vol, "uploads"), { recursive: true });
      copyResult = "success";
    } catch (e) {
      copyResult = `failed: ${(e as Error).message}`;
    }
  }

  return NextResponse.json({
    cwd,
    RAILWAY_VOLUME_PATH: vol || null,
    volExists: vol ? existsSync(vol) : false,
    volContents: vol && existsSync(vol) ? readdirSync(vol) : [],
    dataDir,
    dbPath,
    dbExists: existsSync(dbPath),
    uploadsRoot,
    uploadsExist: existsSync(uploadsRoot),
    publicUploadsExist,
    dataContents,
    copyResult,
    NEXT_PHASE: process.env.NEXT_PHASE || null,
  });
}
