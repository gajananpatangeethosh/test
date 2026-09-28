import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { requireSession } from "@/lib/db/session";
import { getPrivateProfile } from "@/lib/db/dal";

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["video/mp4", "mp4"],
]);
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    if ((await getPrivateProfile(session.address)) === null) {
      return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 403 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PROFILE_FAILED" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

  const path = `${session.address.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const sb = serviceClient();
  const upload = await sb.storage.from("post-media").upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  const { data } = sb.storage.from("post-media").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path, kind: file.type === "video/mp4" ? "video" : "photo" });
}
