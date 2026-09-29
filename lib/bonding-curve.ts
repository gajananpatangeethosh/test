/** Constant-product bonding curve: k = reserveMst × poolSupply, price = reserve / poolSupply. */

export const COIN_INITIAL_SUPPLY = 10_000;
export const COIN_INITIAL_RESERVE = 100;
export const COIN_INITIAL_PRICE = COIN_INITIAL_RESERVE / COIN_INITIAL_SUPPLY;

export type PoolState = {
  reserveMst: number;
  poolSupply: number;
};

export type BuyQuote = {
  units: number;
  spendMst: number;
  newPrice: number;
  newReserve: number;
  newPoolSupply: number;
};

export type SellQuote = {
  units: number;
  proceedsMst: number;
  newPrice: number;
  newReserve: number;
  newPoolSupply: number;
};

function kOf(reserveMst: number, poolSupply: number): number {
  return reserveMst * poolSupply;
}

export function spotPrice(reserveMst: number, poolSupply: number): number {
  if (poolSupply <= 0) return 0;
  return reserveMst / poolSupply;
}

export function marketCap(price: number, initialSupply = COIN_INITIAL_SUPPLY): number {
  return +(price * initialSupply).toFixed(2);
}

/** Units circulating outside the pool (bought by holders). */
export function circulatingSupply(poolSupply: number, initialSupply = COIN_INITIAL_SUPPLY): number {
  return Math.max(0, initialSupply - poolSupply);
}

export function quoteBuy(pool: PoolState, spendMst: number): BuyQuote | null {
  const spend = +spendMst.toFixed(18);
  if (!Number.isFinite(spend) || spend <= 0 || pool.reserveMst < 0 || pool.poolSupply <= 0) return null;

  const k = kOf(pool.reserveMst, pool.poolSupply);
  const units = +((pool.poolSupply * spend) / (pool.reserveMst + spend)).toFixed(8);
  if (units <= 0) return null;

  const newReserve = pool.reserveMst + spend;
  const newPoolSupply = pool.poolSupply - units;
  if (newPoolSupply <= 0) return null;

  return {
    units,
    spendMst: spend,
    newReserve,
    newPoolSupply,
    newPrice: +((newReserve * newReserve) / k).toFixed(18),
  };
}

export function quoteSell(pool: PoolState, unitsIn: number): SellQuote | null {
  const units = +unitsIn.toFixed(8);
  if (!Number.isFinite(units) || units <= 0 || pool.reserveMst <= 0 || pool.poolSupply <= 0) return null;

  const k = kOf(pool.reserveMst, pool.poolSupply);
  const newPoolSupply = pool.poolSupply + units;
  const newReserve = +(k / newPoolSupply).toFixed(18);
  const proceedsMst = +(pool.reserveMst - newReserve).toFixed(18);
  if (proceedsMst <= 0 || newReserve < 0) return null;

  return {
    units,
    proceedsMst,
    newReserve,
    newPoolSupply,
    newPrice: +((newReserve * newReserve) / k).toFixed(18),
  };
}

export function priceImpact(currentPrice: number, newPrice: number): number {
  if (currentPrice <= 0) return 0;
  return +(((newPrice - currentPrice) / currentPrice) * 100).toFixed(2);
}
