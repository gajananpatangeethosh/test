import { NextRequest, NextResponse } from "next/server";
import { getPrivateProfile } from "@/lib/db/dal";
import { verifySignature } from "@/lib/db/session";

export async function POST(req: NextRequest) {
  let body: { address?: unknown; signature?: unknown };
  try {
    body = (await req.json()) as { address?: unknown; signature?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const session = await verifySignature(body.address, body.signature);
    let hasProfile = false;
    let dbReady = true;
    try {
      hasProfile = (await getPrivateProfile(session.address)) !== null;
    } catch (e) {
      if (e instanceof Error && (e.message === "DB_NOT_READY" || e.message.startsWith("DB_NOT_CONFIGURED"))) {
        dbReady = false;
      } else {
        throw e;
      }
    }
    return NextResponse.json({ ok: true, address: session.address, hasProfile, dbReady });
  } catch (e) {
    const message = e instanceof Error ? e.message : "VERIFY_FAILED";
    const status =
      message === "NONCE_EXPIRED" || message === "NONCE_MISMATCH" || message === "SIGNATURE_MISMATCH" || message === "INVALID_SIGNATURE"
        ? 401
        : message === "INVALID_WALLET" || message === "SEED_WALLET_CANNOT_SIGN_IN"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
