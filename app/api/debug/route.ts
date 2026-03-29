import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "fs";
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

  let uploadsExist = existsSync(uploadsRoot);
  let publicUploadsExist = existsSync(join(cwd, "public", "uploads"));

  return NextResponse.json({
    cwd,
    RAILWAY_VOLUME_PATH: vol || null,
    volExists: vol ? existsSync(vol) : false,
    volContents,
    dataDir,
    dbPath,
    dbExists: existsSync(dbPath),
    uploadsRoot,
    uploadsExist,
    publicUploadsExist,
    dataContents,
    NEXT_PHASE: process.env.NEXT_PHASE || null,
  });
}
