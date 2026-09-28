// Centralized MST error handling: technical errors → user-friendly messages.
export type MstErrorCode =
  | "NO_WALLET" | "USER_REJECTED" | "PENDING" | "WRONG_NETWORK" | "NETWORK_SWITCH_REJECTED"
  | "INSUFFICIENT_FUNDS" | "RPC_ERROR" | "TIMEOUT" | "REVERTED" | "MINT_FAILED"
  | "NOT_DEPLOYED" | "BALANCE_ERROR" | "METHOD_UNSUPPORTED" | "SIGN_REJECTED" | "UNKNOWN";
export class MstError extends Error {
  code: MstErrorCode;
  constructor(code: MstErrorCode, message: string) { super(message); this.name = "MstError"; this.code = code; }
}
const FRIENDLY: Record<MstErrorCode, string> = {
  NO_WALLET: "BridgeKey wallet was not detected. Install a MST-compatible wallet and try again.",
  USER_REJECTED: "Wallet rejected the transaction.",
  PENDING: "A wallet request is already pending. Open BridgeKey and respond to it, then try again.",
  METHOD_UNSUPPORTED: "Wallet did not understand the request.",
  SIGN_REJECTED: "The wallet did not return a signature.",
  WRONG_NETWORK: "Please connect to MST Blockchain.",
  NETWORK_SWITCH_REJECTED: "Network switch was rejected.",
  INSUFFICIENT_FUNDS: "Insufficient MST balance.",
  RPC_ERROR: "Unable to connect to MST Blockchain.",
  TIMEOUT: "Transaction confirmation timed out.",
  REVERTED: "Transaction failed.",
  MINT_FAILED: "Could not read the new coin address.",
  NOT_DEPLOYED: "This feature is not deployed yet.",
  BALANCE_ERROR: "Unable to load balance.",
  UNKNOWN: "Something went wrong.",
};
export const friendlyMessage = (code: MstErrorCode) => FRIENDLY[code];
// Outcomes the user caused or chose — surfaced in the UI, never logged as errors.
const EXPECTED: MstErrorCode[] = ["USER_REJECTED", "PENDING", "NETWORK_SWITCH_REJECTED", "WRONG_NETWORK",
  "METHOD_UNSUPPORTED", "NOT_DEPLOYED", "INSUFFICIENT_FUNDS", "SIGN_REJECTED"];
export function toMstError(err: unknown): MstError {
  if (err instanceof MstError) return err;
  const mapped = classify(err);
  if (typeof window !== "undefined" && !EXPECTED.includes(mapped.code)) console.warn("[echo] wallet error:", err);
  return mapped;
}
function classify(err: unknown): MstError {
  const anyErr = err as { code?: unknown; message?: string; name?: string };
  const code = typeof anyErr?.code === "number" ? anyErr.code : undefined;
  const raw = (anyErr?.message || "unknown error").slice(0, 180);
  const msg = raw.toLowerCase();
  if (code === 4001 || msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the connection")) return new MstError("USER_REJECTED", FRIENDLY.USER_REJECTED);
  if (code === -32002 || msg.includes("already pending") || msg.includes("already processing"))
    return new MstError("PENDING", FRIENDLY.PENDING);
  if (code === 4902) return new MstError("WRONG_NETWORK", FRIENDLY.WRONG_NETWORK);
  if (code === -32601 || code === -32602 || msg.includes("not supported") || msg.includes("not found") || msg.includes("method"))
    return new MstError("METHOD_UNSUPPORTED", `${FRIENDLY.METHOD_UNSUPPORTED} (${code ?? "no code"}: ${raw})`);
  if (msg.includes("insufficient funds") || msg.includes("insufficient balance")) return new MstError("INSUFFICIENT_FUNDS", FRIENDLY.INSUFFICIENT_FUNDS);
  if (msg.includes("timed out") || msg.includes("timeout")) return new MstError("TIMEOUT", FRIENDLY.TIMEOUT);
  if (msg.includes("revert") || msg.includes("reverted")) return new MstError("REVERTED", FRIENDLY.REVERTED);
  if (anyErr?.name === "ProviderError" || msg.includes("rpc") || msg.includes("network") || msg.includes("fetch"))
    return new MstError("RPC_ERROR", FRIENDLY.RPC_ERROR);
  // Raw detail included deliberately: this is the debugging path for undocumented wallet behavior.
  return new MstError("UNKNOWN", `Something went wrong. (${code ?? "no code"}: ${raw})`);
}
