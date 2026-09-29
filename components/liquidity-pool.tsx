"use client";
import { ArrowDownRight, ArrowUpRight, Droplets } from "lucide-react";
import { Card } from "./ui";
import {
  COIN_INITIAL_SUPPLY,
  circulatingSupply,
  priceImpact,
  type PoolState,
} from "@/lib/bonding-curve";
import { fmtMst, fmtNum, fmtPct, fmtUnits } from "@/lib/utils";

type Props = {
  price: number;
  reserveMst: number;
  poolSupply: number;
  initialSupply?: number;
  side?: "buy" | "sell";
  projectedPrice?: number;
  compact?: boolean;
};

export function LiquidityPoolCard({
  price,
  reserveMst,
  poolSupply,
  initialSupply = COIN_INITIAL_SUPPLY,
  side,
  projectedPrice,
  compact = false,
}: Props) {
  const circulating = circulatingSupply(poolSupply, initialSupply);
  const poolPct = initialSupply > 0 ? (poolSupply / initialSupply) * 100 : 0;
  const heldPct = initialSupply > 0 ? (circulating / initialSupply) * 100 : 0;
  const impact = projectedPrice ? priceImpact(price, projectedPrice) : null;

  return (
    <Card className={`${compact ? "p-4" : "p-5"} space-y-4`}>
      <div className="flex items-center gap-2">
        <Droplets size={15} className="text-teal-300" />
        <span className="font-semibold text-sm">Liquidity pool</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="muted text-xs">MST in pool</div>
          <div className="font-semibold mt-0.5">{fmtMst(reserveMst)} MST</div>
        </div>
        <div>
          <div className="muted text-xs">Available supply</div>
          <div className="font-semibold mt-0.5">{fmtUnits(poolSupply)} units</div>
        </div>
        <div>
          <div className="muted text-xs">In holders&apos; hands</div>
          <div className="font-semibold mt-0.5">{fmtUnits(circulating)} units</div>
        </div>
        <div>
          <div className="muted text-xs">Spot price</div>
          <div className="font-semibold mt-0.5">{fmtMst(price)} MST</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[11px] muted mb-1.5">
          <span>Pool {fmtPct(poolPct)}</span>
          <span>Held {fmtPct(heldPct)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
          <div className="h-full bg-teal-400/70 transition-all" style={{ width: `${poolPct}%` }} />
          <div className="h-full bg-violet-400/50 transition-all" style={{ width: `${heldPct}%` }} />
        </div>
        <div className="flex gap-3 mt-2 text-[11px] muted">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400/70" />For sale in pool</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400/50" />Bought by users</span>
        </div>
      </div>

      {!compact && (
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-3 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <ArrowUpRight size={14} className="text-teal-300 shrink-0 mt-0.5" />
            <p><span className="text-teal-200 font-medium">Buying</span> adds MST to the pool and removes units — less supply for sale, so price rises.</p>
          </div>
          <div className="flex items-start gap-2">
            <ArrowDownRight size={14} className="text-red-300 shrink-0 mt-0.5" />
            <p><span className="text-red-200 font-medium">Selling</span> returns units to the pool and pulls MST out — more supply available, so price falls.</p>
          </div>
        </div>
      )}

      {projectedPrice != null && side && impact != null && (
        <div className={`rounded-xl border p-3 text-xs ${side === "buy" ? "border-teal-300/30 bg-teal-300/5" : "border-red-300/30 bg-red-300/5"}`}>
          <div className="flex justify-between">
            <span className="muted">After this {side}</span>
            <span className="font-medium">{fmtMst(projectedPrice)} MST</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="muted">Price impact</span>
            <span className={impact >= 0 ? "text-teal-300" : "text-red-300"}>
              {impact >= 0 ? "+" : ""}{impact}%
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

export function poolFromMarket(coin: {
  liquidity: number;
  poolSupply?: number;
  reserveMst?: number;
  price: number;
}): PoolState {
  const reserveMst = coin.reserveMst ?? coin.liquidity;
  const poolSupply = coin.poolSupply ?? (coin.price > 0 ? reserveMst / coin.price : COIN_INITIAL_SUPPLY);
  return { reserveMst, poolSupply };
}
