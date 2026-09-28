import { NextRequest, NextResponse } from "next/server";
import { createNonce } from "@/lib/db/session";

export async function POST(req: NextRequest) {
  let body: { address?: unknown };
  try {
    body = (await req.json()) as { address?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const result = await createNonce(body.address);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "NONCE_FAILED";
    const status = message === "INVALID_WALLET" || message === "SEED_WALLET_CANNOT_SIGN_IN" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
