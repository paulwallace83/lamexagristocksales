import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, resolve, extname } from "path";
import { getUploadsRoot } from "@/lib/paths";
import { auth } from "@/lib/auth";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Sanitize a single path segment — strips path-traversal characters while
 *  preserving spaces, pipes, and other characters valid in filenames.
 *  The resolve().startsWith() traversal guard is the real security backstop.
 */
function safeSeg(segment: string): string {
  return decodeURIComponent(segment).replace(/[/\\?%*<>"\x00-\x1f]/g, "_");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const uploadsRoot = resolve(getUploadsRoot());
  const safeParts = segments.map(safeSeg);
  const filepath = resolve(join(uploadsRoot, ...safeParts));

  // Path traversal guard
  if (!filepath.startsWith(uploadsRoot + "/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Restrict COA, test-results, and spec sheets to authenticated QA/reviewer users
  const RESTRICTED_CATEGORIES = new Set(["coa", "test-results", "specs"]);
  if (safeParts.some((seg) => RESTRICTED_CATEGORIES.has(seg))) {
    const session = await auth();
    if (!session?.user?.role || !["qa", "reviewer"].includes(session.user.role)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (!existsSync(filepath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = extname(filepath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const fileBuffer = readFileSync(filepath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
