-- MSTORA 0002: creator coins — one per profile — plus a trading ledger.
--
-- Why a ledger instead of an immediate chain mint: the CreatorFactory /
-- CreatorCoin / Marketplace contracts are not deployed yet (all three
-- NEXT_PUBLIC_*_ADDRESS values are empty), so every on-chain write correctly
-- reports NOT_DEPLOYED. The ledger makes Markets, per-user coins and
-- buy/sell work today, and every row already carries the on-chain fields
-- (chain_id / token_address / token_id / mint_tx_hash / mint_status) so a row
-- becomes a real MST NFT without a data migration once contracts ship.
--
-- mint_status:
--   pending — coin exists in the ledger, NFT not minted yet (today's state)
--   minting — owner's wallet is signing the mint
--   minted  — token_address + token_id + mint_tx_hash are populated
--   failed  — mint_error carries the reason
--
-- Pricing is a constant-product curve: k = reserve_mst * total_supply, and
-- spot price = k / total_supply^2 = reserve_mst^2 / k. Buys add MST to the
-- reserve and remove units; sells do the reverse, so k never changes.

create extension if not exists citext with schema extensions;

-- ── creator_coins ────────────────────────────────────────────────────────────
-- One coin per profile, enforced by the unique owner_wallet.
create table if not exists public.creator_coins (
  id uuid primary key default gen_random_uuid(),
  owner_wallet extensions.citext not null unique
    references public.profiles(wallet_address) on delete cascade,
  name text not null,
  symbol extensions.citext not null unique,
  price_mst numeric(36,18) not null default 0.01,
  reserve_mst numeric(36,18) not null default 10000,
  total_supply numeric(36,18) not null default 1000000,
  chain_id text,
  token_address text,
  token_id text,
  mint_status text not null default 'pending',
  mint_tx_hash text,
  mint_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint creator_coins_symbol_format check (symbol::text ~ '^[A-Z0-9]{2,10}$'),
  constraint creator_coins_name_len check (char_length(name) between 1 and 60),
  constraint creator_coins_price_positive check (price_mst > 0),
  constraint creator_coins_supply_positive check (total_supply > 0),
  constraint creator_coins_reserve_nonneg check (reserve_mst >= 0),
  constraint creator_coins_mint_status check (mint_status in ('pending','minting','minted','failed')),
  -- A minted coin must be traceable back to a chain transaction.
  constraint creator_coins_minted_has_chain check (
    mint_status <> 'minted' or (token_address is not null and mint_tx_hash is not null)
  )
);

-- ── coin_holdings: who owns how many units ───────────────────────────────────
create table if not exists public.coin_holdings (
  coin_id uuid not null references public.creator_coins(id) on delete cascade,
  wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  amount numeric(36,18) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (coin_id, wallet),
  constraint coin_holdings_amount_nonneg check (amount >= 0)
);

-- ── coin_trades: the tape, and the source of volume/change/sparkline ─────────
create table if not exists public.coin_trades (
  id uuid primary key default gen_random_uuid(),
  coin_id uuid not null references public.creator_coins(id) on delete cascade,
  side text not null,
  trader_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  counterparty_wallet extensions.citext references public.profiles(wallet_address) on delete set null,
  amount numeric(36,18) not null,
  price_mst numeric(36,18) not null,
  total_mst numeric(36,18) not null,
  settlement text not null default 'offchain',
  created_at timestamptz not null default now(),
  constraint coin_trades_side check (side in ('buy','sell')),
  constraint coin_trades_settlement check (settlement in ('offchain','onchain')),
  constraint coin_trades_amount_positive check (amount > 0),
  constraint coin_trades_price_positive check (price_mst > 0),
  constraint coin_trades_total_nonneg check (total_mst >= 0)
);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger creator_coins_touch before update on public.creator_coins
  for each row execute function public.touch_updated_at();
create trigger coin_holdings_touch before update on public.coin_holdings
  for each row execute function public.touch_updated_at();

-- ── holding helper ──────────────────────────────────────────────────────────
-- Upsert + delta so trades never need read-modify-write in application code.
-- The check constraint is the final guard; the explicit raise gives a
-- readable error for INSUFFICIENT_COIN_BALANCE.
create or replace function public.adjust_coin_holding(p_coin uuid, p_wallet text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Selling from a wallet that has no row must fail loudly, not insert a
  -- zero balance and report success.
  if p_delta < 0 and not exists (
    select 1 from public.coin_holdings where coin_id = p_coin and wallet = p_wallet
  ) then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;

  insert into public.coin_holdings (coin_id, wallet, amount)
  values (p_coin, p_wallet::extensions.citext, greatest(p_delta, 0))
  on conflict (coin_id, wallet) do update
    set amount = coin_holdings.amount + p_delta, updated_at = now();

  if (select amount from public.coin_holdings where coin_id = p_coin and wallet = p_wallet) < 0 then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;
end;
$$;

-- ── one coin per profile ────────────────────────────────────────────────────
-- Idempotent: returns the existing coin id if the profile already has one, so
-- it is safe to call from the insert trigger, from a backfill, and from a
-- "my coin" read path.
create or replace function public.ensure_creator_coin(p_wallet text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c_id uuid;
  c_username extensions.citext;
  c_display text;
  c_name text;
  c_base text;
  c_symbol text;
  i integer;
begin
  if not exists (select 1 from public.profiles where wallet_address = p_wallet) then
    raise exception 'PROFILE_REQUIRED';
  end if;

  select id into c_id from public.creator_coins where owner_wallet = p_wallet;
  if c_id is not null then
    return c_id;
  end if;

  select username, display_name into c_username, c_display
    from public.profiles where wallet_address = p_wallet;

  c_name := left(coalesce(nullif(btrim(c_display), ''), c_username::text), 60);

  -- Symbol from the username, uppercase, letters/digits only, max 6 chars.
  c_base := upper(regexp_replace(c_username::text, '[^a-zA-Z0-9]', '', 'g'));
  if char_length(c_base) < 2 then
    c_base := 'COIN';
  end if;
  c_base := left(c_base, 6);

  -- Symbols are unique; append a counter on collision.
  c_symbol := c_base;
  for i in 1..20 loop
    if not exists (select 1 from public.creator_coins where symbol = c_symbol) then
      exit;
    end if;
    c_symbol := left(c_base, 6 - length(i::text)) || i::text;
  end loop;

  insert into public.creator_coins (owner_wallet, name, symbol)
  values (p_wallet::extensions.citext, c_name, c_symbol)
  returning id into c_id;

  -- The creator holds the entire initial float.
  insert into public.coin_holdings (coin_id, wallet, amount)
  values (c_id, p_wallet::extensions.citext, (select total_supply from public.creator_coins where id = c_id));

  return c_id;
end;
$$;

create or replace function public.on_profile_created_coin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_creator_coin(new.wallet_address::text);
  return null;
end;
$$;

drop trigger if exists profiles_creator_coin on public.profiles;
create trigger profiles_creator_coin
  after insert on public.profiles
  for each row execute function public.on_profile_created_coin();

-- ── backfill: every profile that predates this migration gets its coin ──────
do $$
declare
  r record;
begin
  for r in select wallet_address::text as w from public.profiles loop
    perform public.ensure_creator_coin(r.w);
  end loop;
end;
$$;

-- ── the trade ───────────────────────────────────────────────────────────────
-- Runs as one transaction and takes a row lock on the coin, so two buyers
-- cannot both spend against the same reserve. settlement is 'onchain' only
-- once the coin has a token_address; until then the ledger is the record and
-- the UI labels it as off-chain.
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

    -- units = supply * d_reserve / (reserve + d_reserve)
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

  -- sell
  select amount into have
    from public.coin_holdings where coin_id = c.id and wallet = p_trader;
  have := coalesce(have, 0);
  if have < p_amount then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;

  units := round(p_amount, 8);

  -- d_reserve = supply * d_supply / (supply + d_supply) - reserve
  proceeds := round((c.total_supply * units) / (c.total_supply + units) - c.reserve_mst, 18);
  if proceeds < 0 then
    raise exception 'POOL_EMPTY';
  end if;

  new_reserve := c.reserve_mst - proceeds;
  new_supply := c.total_supply + units;
  if new_reserve < 0 then
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

-- ── indexes ─────────────────────────────────────────────────────────────────
create index if not exists creator_coins_created on public.creator_coins (created_at desc);
create index if not exists coin_holdings_wallet on public.coin_holdings (wallet);
create index if not exists coin_trades_coin_created on public.coin_trades (coin_id, created_at desc);

-- ── lockdown: RLS on, no client policies, RPC closed to the public role ─────
alter table public.creator_coins enable row level security;
alter table public.coin_holdings enable row level security;
alter table public.coin_trades enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

revoke execute on function public.trade_creator_coin(text, uuid, text, numeric) from public;
revoke execute on function public.ensure_creator_coin(text) from public;
revoke execute on function public.adjust_coin_holding(uuid, text, numeric) from public;

-- The secret key connects as service_role; without this grant the RPCs above
-- would be unreachable from the app after the revoke.
grant execute on function public.trade_creator_coin(text, uuid, text, numeric) to service_role;
grant execute on function public.ensure_creator_coin(text) to service_role;
