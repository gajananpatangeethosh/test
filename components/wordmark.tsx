import { APP_NAME } from "@/lib/brand";

/** Two-tone wordmark: the brand name with its accent letter. */
export function Wordmark({ className = "" }: { className?: string }) {
  const stem = APP_NAME.slice(0, -1);
  const accent = APP_NAME.slice(-1);
  return <span className={`font-bold tracking-tight ${className}`}>{stem}<span className="text-teal-300">{accent}</span></span>;
}
