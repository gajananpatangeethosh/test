-- MSTORA 0005: launch creator coins at 100 MST market cap (matching post coins)
-- and fix the sell-side bonding-curve payout formula.
--
-- Before: reserve=10_000, pool supply=1_000_000 → price 0.01, market cap 10_000 MST
-- After:  reserve=100, pool supply=10_000 → price 0.01, market cap 100 MST
--
-- Buys add MST to the reserve and remove units from the pool (demand ↑, supply ↓, price ↑).
-- Sells return units to the pool and remove MST from the reserve (supply ↑, price ↓).

alter table public.creator_coins
  alter column reserve_mst set default 100,
  alter column total_supply set default 10000;

-- Reset coins that still carry the old launch defaults (no trades have moved the curve yet).
update public.creator_coins
set reserve_mst = 100,
    total_supply = 10000,
    price_mst = 0.01
where reserve_mst = 10000
  and total_supply = 1000000
  and price_mst = 0.01;

create or replace function public.trade_creator_coin(
  p_trader text,
  p_coin uuid,
  p_side text,
  p_amount numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_coin_id uuid;
  k numeric;
  units numeric;
  spend numeric;
  proceeds numeric;
  have numeric;
  hold numeric;
  settled text;
  new_reserve numeric;
  new_supply numeric;
begin
  if p_side not in ('buy','sell') then
    raise exception 'INVALID_COIN_SIDE';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_COIN_AMOUNT';
  end if;
  if p_amount > 1000000 then
    raise exception 'COIN_AMOUNT_TOO_LARGE';
  end if;
  if not exists (select 1 from public.profiles where wallet_address = p_trader) then
    raise exception 'PROFILE_REQUIRED';
  end if;

  select * into c from public.creator_coins where id = p_coin for update;
  if not found then
    raise exception 'COIN_NOT_FOUND';
  end if;
  v_coin_id := c.id;

  k := c.reserve_mst * c.total_supply;
  settled := case when c.token_address is not null then 'onchain' else 'offchain' end;

  if p_side = 'buy' then
    spend := round(p_amount, 18);
    if spend < 0.00000001 then
      raise exception 'COIN_AMOUNT_TOO_SMALL';
    end if;

    units := round((c.total_supply * spend) / (c.reserve_mst + spend), 8);
    if units < 0.00000001 then
      raise exception 'COIN_AMOUNT_TOO_SMALL';
    end if;

    new_reserve := c.reserve_mst + spend;
    new_supply := c.total_supply - units;
    if new_supply <= 0 then
      raise exception 'COIN_SUPPLY_EXHAUSTED';
    end if;

    perform public.adjust_coin_holding(v_coin_id, p_trader, units);

    update public.creator_coins
      set reserve_mst = new_reserve,
          total_supply = new_supply,
          price_mst = round((new_reserve * new_reserve) / k, 18)
    where id = v_coin_id;

    insert into public.coin_trades
      (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
    values
      (v_coin_id, 'buy', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, spend, settled);

    select amount into hold
      from public.coin_holdings where coin_id = v_coin_id and wallet = p_trader;

    return jsonb_build_object(
      'side', 'buy',
      'amount', units,
      'totalMst', spend,
      'price', round((new_reserve * new_reserve) / k, 18),
      'holding', hold
    );
  end if;

  select amount into have
    from public.coin_holdings where coin_id = c.id and wallet = p_trader;
  have := coalesce(have, 0);
  if have < p_amount then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;

  units := round(p_amount, 8);
  new_supply := c.total_supply + units;
  new_reserve := round(k / new_supply, 18);
  proceeds := round(c.reserve_mst - new_reserve, 18);
  if proceeds <= 0 or new_reserve < 0 then
    raise exception 'POOL_EMPTY';
  end if;

  perform public.adjust_coin_holding(v_coin_id, p_trader, -units);

  update public.creator_coins
    set reserve_mst = new_reserve,
        total_supply = new_supply,
        price_mst = round((new_reserve * new_reserve) / k, 18)
  where id = v_coin_id;

  insert into public.coin_trades
    (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
  values
    (v_coin_id, 'sell', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, proceeds, settled);

  select amount into hold
    from public.coin_holdings where coin_id = v_coin_id and wallet = p_trader;

  return jsonb_build_object(
    'side', 'sell',
    'amount', units,
    'totalMst', proceeds,
    'price', round((new_reserve * new_reserve) / k, 18),
    'holding', hold
  );
end;
$$;

create or replace function public.trade_post_coin(
  p_trader text, p_coin uuid, p_side text, p_amount numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; v_coin_id uuid; k numeric; units numeric; spend numeric; proceeds numeric;
  have numeric; hold numeric; settled text; new_reserve numeric; new_supply numeric; v_post_id text;
begin
  if p_side not in ('buy','sell') then raise exception 'INVALID_COIN_SIDE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_COIN_AMOUNT'; end if;
  if p_amount > 1000000 then raise exception 'COIN_AMOUNT_TOO_LARGE'; end if;
  if not exists (select 1 from public.profiles where wallet_address = p_trader) then raise exception 'PROFILE_REQUIRED'; end if;

  select * into c from public.post_coins where id = p_coin for update;
  if not found then raise exception 'COIN_NOT_FOUND'; end if;
  v_coin_id := c.id; v_post_id := c.post_id;
  k := c.reserve_mst * c.total_supply;
  settled := case when c.token_address is not null then 'onchain' else 'offchain' end;

  if p_side = 'buy' then
    spend := round(p_amount, 18);
    if spend < 0.00000001 then raise exception 'COIN_AMOUNT_TOO_SMALL'; end if;
    units := round((c.total_supply * spend) / (c.reserve_mst + spend), 8);
    if units < 0.00000001 then raise exception 'COIN_AMOUNT_TOO_SMALL'; end if;
    new_reserve := c.reserve_mst + spend;
    new_supply := c.total_supply - units;
    if new_supply <= 0 then raise exception 'COIN_SUPPLY_EXHAUSTED'; end if;
    perform public.adjust_post_coin_holding(v_coin_id, p_trader, units);
    update public.post_coins set reserve_mst = new_reserve, total_supply = new_supply,
      price_mst = round((new_reserve * new_reserve) / k, 18) where id = v_coin_id;
    insert into public.post_coin_trades (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
    values (v_coin_id, 'buy', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, spend, settled);
    update public.posts set collect_count = collect_count + 1 where id = v_post_id;
    select amount into hold from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;
    return jsonb_build_object('side','buy','amount',units,'totalMst',spend,'price',round((new_reserve*new_reserve)/k,18),'holding',hold);
  end if;

  select amount into have from public.post_coin_holdings where coin_id = c.id and wallet = p_trader;
  have := coalesce(have, 0);
  if have < p_amount then raise exception 'INSUFFICIENT_COIN_BALANCE'; end if;
  units := round(p_amount, 8);
  new_supply := c.total_supply + units;
  new_reserve := round(k / new_supply, 18);
  proceeds := round(c.reserve_mst - new_reserve, 18);
  if proceeds <= 0 or new_reserve < 0 then raise exception 'POOL_EMPTY'; end if;
  perform public.adjust_post_coin_holding(v_coin_id, p_trader, -units);
  update public.post_coins set reserve_mst = new_reserve, total_supply = new_supply,
    price_mst = round((new_reserve * new_reserve) / k, 18) where id = v_coin_id;
  insert into public.post_coin_trades (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
  values (v_coin_id, 'sell', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, proceeds, settled);
  select amount into hold from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;
  return jsonb_build_object('side','sell','amount',units,'totalMst',proceeds,'price',round((new_reserve*new_reserve)/k,18),'holding',hold);
end;
$$;
