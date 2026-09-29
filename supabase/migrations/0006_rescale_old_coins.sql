-- MSTORA 0006: rescale creator coins still on the old 1M-unit model and
-- record post-trade prices in the trade tape so charts reflect real moves.

-- Old launch: reserve 10_000 MST, pool 1_000_000 units.
-- New launch: reserve 100 MST, pool 10_000 units (same price, 100x smaller scale).

do $$
declare
  r record;
begin
  for r in
    select id
    from public.creator_coins
    where total_supply > 50000
       or reserve_mst > 500
  loop
    update public.creator_coins
    set reserve_mst = round(reserve_mst / 100, 18),
        total_supply = round(total_supply / 100, 8)
    where id = r.id;

    update public.coin_holdings
    set amount = round(amount / 100, 8)
    where coin_id = r.id
      and amount > 0;

    update public.coin_trades
    set amount = round(amount / 100, 8)
    where coin_id = r.id;
  end loop;
end;
$$;

-- Align the latest trade marker with the coin's current spot price.
update public.coin_trades t
set price_mst = c.price_mst
from public.creator_coins c
where t.coin_id = c.id
  and t.id = (
    select id from public.coin_trades
    where coin_id = c.id
    order by created_at desc
    limit 1
  );

-- Trade tape should store the post-trade spot price, not the pre-trade quote.
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
  new_price numeric;
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
    new_price := round((new_reserve * new_reserve) / k, 18);

    perform public.adjust_coin_holding(v_coin_id, p_trader, units);

    update public.creator_coins
      set reserve_mst = new_reserve,
          total_supply = new_supply,
          price_mst = new_price
    where id = v_coin_id;

    insert into public.coin_trades
      (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
    values
      (v_coin_id, 'buy', p_trader::extensions.citext, c.owner_wallet, units, new_price, spend, settled);

    select amount into hold
      from public.coin_holdings where coin_id = v_coin_id and wallet = p_trader;

    return jsonb_build_object(
      'side', 'buy',
      'amount', units,
      'totalMst', spend,
      'price', new_price,
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
  new_price := round((new_reserve * new_reserve) / k, 18);

  perform public.adjust_coin_holding(v_coin_id, p_trader, -units);

  update public.creator_coins
    set reserve_mst = new_reserve,
        total_supply = new_supply,
        price_mst = new_price
  where id = v_coin_id;

  insert into public.coin_trades
    (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
  values
    (v_coin_id, 'sell', p_trader::extensions.citext, c.owner_wallet, units, new_price, proceeds, settled);

  select amount into hold
    from public.coin_holdings where coin_id = v_coin_id and wallet = p_trader;

  return jsonb_build_object(
    'side', 'sell',
    'amount', units,
    'totalMst', proceeds,
    'price', new_price,
    'holding', hold
  );
end;
$$;

create or replace function public.trade_post_coin(
  p_trader text, p_coin uuid, p_side text, p_amount numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; v_coin_id uuid; k numeric; units numeric; spend numeric; proceeds numeric;
  have numeric; hold numeric; settled text; new_reserve numeric; new_supply numeric; new_price numeric; v_post_id text;
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
    new_price := round((new_reserve * new_reserve) / k, 18);
    perform public.adjust_post_coin_holding(v_coin_id, p_trader, units);
    update public.post_coins set reserve_mst = new_reserve, total_supply = new_supply, price_mst = new_price where id = v_coin_id;
    insert into public.post_coin_trades (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
    values (v_coin_id, 'buy', p_trader::extensions.citext, c.owner_wallet, units, new_price, spend, settled);
    update public.posts set collect_count = collect_count + 1 where id = v_post_id;
    select amount into hold from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;
    return jsonb_build_object('side','buy','amount',units,'totalMst',spend,'price',new_price,'holding',hold);
  end if;

  select amount into have from public.post_coin_holdings where coin_id = c.id and wallet = p_trader;
  have := coalesce(have, 0);
  if have < p_amount then raise exception 'INSUFFICIENT_COIN_BALANCE'; end if;
  units := round(p_amount, 8);
  new_supply := c.total_supply + units;
  new_reserve := round(k / new_supply, 18);
  proceeds := round(c.reserve_mst - new_reserve, 18);
  if proceeds <= 0 or new_reserve < 0 then raise exception 'POOL_EMPTY'; end if;
  new_price := round((new_reserve * new_reserve) / k, 18);
  perform public.adjust_post_coin_holding(v_coin_id, p_trader, -units);
  update public.post_coins set reserve_mst = new_reserve, total_supply = new_supply, price_mst = new_price where id = v_coin_id;
  insert into public.post_coin_trades (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
  values (v_coin_id, 'sell', p_trader::extensions.citext, c.owner_wallet, units, new_price, proceeds, settled);
  select amount into hold from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;
  return jsonb_build_object('side','sell','amount',units,'totalMst',proceeds,'price',new_price,'holding',hold);
end;
$$;
