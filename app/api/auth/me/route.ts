import { NextResponse } from "next/server";
import { getPrivateProfile } from "@/lib/db/dal";
import { getSession } from "@/lib/db/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ address: null, hasProfile: false, profile: null, dbReady: true });
  try {
    const profile = await getPrivateProfile(session.address);
    return NextResponse.json({ address: session.address, hasProfile: profile !== null, profile, dbReady: true });
  } catch (e) {
    if (e instanceof Error && (e.message === "DB_NOT_READY" || e.message.startsWith("DB_NOT_CONFIGURED"))) {
      return NextResponse.json({ address: session.address, hasProfile: false, profile: null, dbReady: false });
    }
    return NextResponse.json({ error: "ME_FAILED" }, { status: 500 });
  }
}
