// Server-only wallet session.
// Flow: POST /api/auth/nonce -> wallet personal_sign -> POST /api/auth/verify.
// The session cookie is a signed JWT; Server Actions and the DAL read it from
// cookies, never from client-supplied parameters.

import { cookies } from "next/headers";
import * as jose from "jose";
import { ethers } from "ethers";
import { isProduction, sessionSecret } from "./env";
import { requireLoginAddress } from "./wallets";

export const SESSION_COOKIE = "echo_session";
const NONCE_COOKIE = "echo_auth_nonce";
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type WalletSession = { address: string };

export function buildSignInMessage(address: string, nonce: string, issuedAt: number): string {
  return [
    "Sign in to Echo",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
    "",
    "This signature proves you control this wallet. It never moves funds.",
  ].join("\n");
}

export async function createNonce(addressInput: unknown): Promise<{ message: string; nonce: string; issuedAt: number }> {
  const address = ethers.getAddress(requireLoginAddress(addressInput));
  const nonce = crypto.randomUUID();
  const issuedAt = Date.now();
  const store = await cookies();
  store.set(NONCE_COOKIE, JSON.stringify({ address, nonce, issuedAt }), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: Math.ceil(NONCE_TTL_MS / 1000),
  });
  return { message: buildSignInMessage(address, nonce, issuedAt), nonce, issuedAt };
}

export async function verifySignature(addressInput: unknown, signatureInput: unknown): Promise<WalletSession> {
  if (typeof signatureInput !== "string" || !signatureInput) throw new Error("INVALID_SIGNATURE");
  const address = ethers.getAddress(requireLoginAddress(addressInput));
  const store = await cookies();
  const raw = store.get(NONCE_COOKIE)?.value;
  if (!raw) throw new Error("NONCE_EXPIRED");
  let saved: { address?: unknown; nonce?: unknown; issuedAt?: unknown };
  try {
    saved = JSON.parse(raw) as { address?: unknown; nonce?: unknown; issuedAt?: unknown };
  } catch {
    throw new Error("NONCE_EXPIRED");
  }
  if (saved.address !== address || typeof saved.nonce !== "string" || typeof saved.issuedAt !== "number") {
    throw new Error("NONCE_MISMATCH");
  }
  if (Date.now() - saved.issuedAt > NONCE_TTL_MS) {
    store.delete(NONCE_COOKIE);
    throw new Error("NONCE_EXPIRED");
  }
  const message = buildSignInMessage(address, saved.nonce, saved.issuedAt);
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signatureInput);
  } catch {
    throw new Error("INVALID_SIGNATURE");
  }
  if (ethers.getAddress(recovered) !== address) throw new Error("SIGNATURE_MISMATCH");

  const token = await new jose.SignJWT({ address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
  store.delete(NONCE_COOKIE);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { address };
}

export async function getSession(): Promise<WalletSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, sessionSecret());
    if (typeof payload.address !== "string") return null;
    return { address: ethers.getAddress(requireLoginAddress(payload.address)) };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<WalletSession> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(NONCE_COOKIE);
}
