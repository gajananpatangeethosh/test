// Orbit "Transaction" mode — shared intent validation.
//
// SECURITY MODEL (read before changing anything here):
// The LLM in this app is treated as an UNTRUSTED PARSER, never as an executor.
// It can only ever *propose* a transfer. It has no signer, no key, and its output
// is re-validated by this module on both the server and the client before any UI
// renders a "confirm" affordance. The connected wallet is always the `from` —
// the model is structurally incapable of naming a sender.
//
// Every check below is deliberately duplicated on the client so that a tampered
// response body still cannot produce a confirmable transaction.
import { formatUnits, getAddress, isAddress, parseUnits } from "ethers";
import { ACTIVE_NETWORK } from "@/lib/mst/config";

export type TransferDraft = { to: string; amount: string; memo?: string };

/** Per-transfer ceiling, in whole currency units. */
export const MAX_TRANSFER = (() => {
  const n = Number(process.env.NEXT_PUBLIC_ORBIT_MAX_TRANSFER ?? "100");
  return Number.isFinite(n) && n > 0 ? n : 100;
})();

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
// Plain positive decimal. No sign, no exponent, no hex, no separators, max 18 dp.
const DECIMAL_RE = /^\d+(?:\.\d{1,18})?$/;

// Exact, case-insensitive, and refuses to match a prefix of a longer hex run
// (so a 64-char tx hash is never mistaken for an address).
const ADDRESS_SCAN = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
// Any hex-looking token, including a truncated address the user fat-fingered.
const ANY_HEX = /0x[0-9a-fA-F]*/g;

/**
 * Direct-send is the default. The wallet prompt is the confirmation step.
 * Set to "1" to put a review step in the thread before the wallet is opened.
 */
export const REQUIRE_CONFIRM = process.env.NEXT_PUBLIC_ORBIT_REQUIRE_CONFIRM === "1";

/** Pull every plausible address out of free text, deterministically. */
export function extractAddresses(text: string): string[] {
  const found = text.match(ADDRESS_SCAN) ?? [];
  return Array.from(new Set(found.map((a) => a.toLowerCase())));
}

/**
 * Pull every plausible amount out of free text, deterministically.
 *
 * Hex tokens (addresses and truncated ones) are stripped first, otherwise the
 * 40 digits of an address look like a number. Thousands separators are folded
 * so "1,000" reads as 1000. Deduplicated, positive only.
 *
 * This exists so the amount the wallet shows is the amount the user typed, not
 * something the model re-emitted.
 */
export function extractAmounts(text: string): string[] {
  const stripped = text
    .replace(ANY_HEX, " ")
    .replace(/,(?=\d{3}\b)/g, "");
  const found = stripped.match(/\d+(?:\.\d+)?/g) ?? [];
  return Array.from(new Set(found)).filter((n) => Number(n) > 0);
}

export type TxCheck =
  | { ok: true; to: string; amount: string; value: string; memo: string }
  | { ok: false; error: string };

/**
 * Validate a proposed transfer. `from` is the connected wallet; the proposal
 * must send *from* it, so a mismatch is a hard failure rather than a warning.
 */
export function checkTransfer(draft: TransferDraft, from: string | null): TxCheck {
  const to = (draft.to ?? "").trim();
  const amount = (draft.amount ?? "").trim();
  const memo = (draft.memo ?? "").trim().slice(0, 140);

  if (!ADDR_RE.test(to) || !isAddress(to))
    return { ok: false, error: "That's not a valid wallet address. Check it starts with 0x and is 42 characters." };

  let toChecksum: string;
  try { toChecksum = getAddress(to); } catch { return { ok: false, error: "Invalid recipient address." }; }

  if (!from) return { ok: false, error: "Connect your wallet first." };
  const fromChecksum = (() => { try { return getAddress(from); } catch { return ""; } })();
  if (!fromChecksum) return { ok: false, error: "Your wallet address could not be read. Reconnect and try again." };
  if (toChecksum === fromChecksum)
    return { ok: false, error: "Recipient is your own address. Pick someone else." };

  if (!DECIMAL_RE.test(amount))
    return { ok: false, error: "Enter the amount as a plain number, e.g. 5 or 12.5." };

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0)
    return { ok: false, error: "Amount must be greater than zero." };
  if (amt > MAX_TRANSFER)
    return { ok: false, error: `Amount is over the ${MAX_TRANSFER} ${ACTIVE_NETWORK.currencySymbol} per-transfer limit.` };

  let value: string;
  try { value = parseUnits(amount, ACTIVE_NETWORK.currencyDecimals).toString(); }
  catch { return { ok: false, error: "Amount has too many decimal places." }; }
  if (BigInt(value) <= BigInt(0)) return { ok: false, error: "Amount must be greater than zero." };

  return { ok: true, to: toChecksum, amount, value, memo };
}

/** Base-unit string -> human units, for balance checks. */
export const toUnits = (value: bigint | string) =>
  formatUnits(BigInt(value), ACTIVE_NETWORK.currencyDecimals);

export const currency = () => ACTIVE_NETWORK.currencySymbol;

/**
 * Client-side affordability gate. The wallet will reject an unaffordable send,
 * but failing early gives a readable message instead of a raw RPC error.
 */
export function checkBalance(draft: TransferDraft, balance: string | null): string | null {
  if (balance === null) return null;
  const amt = Number((draft.amount ?? "").trim());
  if (!DECIMAL_RE.test((draft.amount ?? "").trim()) || !Number.isFinite(amt)) return null;
  const bal = Number(balance);
  if (!Number.isFinite(bal)) return null;
  if (amt > bal) return `Your balance is ${balance} ${ACTIVE_NETWORK.currencySymbol}, which is less than ${amt}.`;
  return null;
}

/** Ask the parser for a transfer; result is still untrusted until checkTransfer runs. */
export type TransferParseResponse =
  | { ok: true; draft: TransferDraft }
  | { ok: false; question: string };
