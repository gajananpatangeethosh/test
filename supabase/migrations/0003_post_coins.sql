-- Echo 0003: post coins — one tradable NFT token per live post.
-- Constant-product curve (same as creator coins): more buyers → higher price.

create extension if not exists citext with schema extensions;

-- posts.coin_id is text (mock slugs in 0001). Some DBs added a legacy FK to a
-- separate public.coins table — drop it so live post_coin uuids can be stored.
alter table public.posts drop constraint if exists posts_coin_id_fkey;

-- ── post_coins ───────────────────────────────────────────────────────────────
create table if not exists public.post_coins (
  id uuid primary key default gen_random_uuid(),
  post_id text not null unique references public.posts(id) on delete cascade,
  owner_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  name text not null,
  symbol extensions.citext not null unique,
  price_mst numeric(36,18) not null default 0.01,
  reserve_mst numeric(36,18) not null default 100,
  total_supply numeric(36,18) not null default 10000,
  chain_id text,
  token_address text,
  token_id text,
  mint_status text not null default 'pending',
  mint_tx_hash text,
  mint_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_coins_symbol_format check (symbol::text ~ '^[A-Z0-9]{2,10}$'),
  constraint post_coins_name_len check (char_length(name) between 1 and 60),
  constraint post_coins_price_positive check (price_mst > 0),
  constraint post_coins_supply_positive check (total_supply > 0),
  constraint post_coins_reserve_nonneg check (reserve_mst >= 0),
  constraint post_coins_mint_status check (mint_status in ('pending','minting','minted','failed')),
  constraint post_coins_minted_has_chain check (
    mint_status <> 'minted' or (token_address is not null and mint_tx_hash is not null)
  )
);

-- ── holdings ─────────────────────────────────────────────────────────────────
create table if not exists public.post_coin_holdings (
  coin_id uuid not null references public.post_coins(id) on delete cascade,
  wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  amount numeric(36,18) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (coin_id, wallet),
  constraint post_coin_holdings_amount_nonneg check (amount >= 0)
);

-- ── trade tape ───────────────────────────────────────────────────────────────
create table if not exists public.post_coin_trades (
  id uuid primary key default gen_random_uuid(),
  coin_id uuid not null references public.post_coins(id) on delete cascade,
  side text not null,
  trader_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  counterparty_wallet extensions.citext references public.profiles(wallet_address) on delete set null,
  amount numeric(36,18) not null,
  price_mst numeric(36,18) not null,
  total_mst numeric(36,18) not null,
  settlement text not null default 'offchain',
  created_at timestamptz not null default now(),
  constraint post_coin_trades_side check (side in ('buy','sell')),
  constraint post_coin_trades_settlement check (settlement in ('offchain','onchain')),
  constraint post_coin_trades_amount_positive check (amount > 0),
  constraint post_coin_trades_price_positive check (price_mst > 0),
  constraint post_coin_trades_total_nonneg check (total_mst >= 0)
);

create trigger post_coins_touch before update on public.post_coins
  for each row execute function public.touch_updated_at();
create trigger post_coin_holdings_touch before update on public.post_coin_holdings
  for each row execute function public.touch_updated_at();

-- ── holding helper ───────────────────────────────────────────────────────────
create or replace function public.adjust_post_coin_holding(p_coin uuid, p_wallet text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_delta < 0 and not exists (
    select 1 from public.post_coin_holdings where coin_id = p_coin and wallet = p_wallet
  ) then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;

  insert into public.post_coin_holdings (coin_id, wallet, amount)
  values (p_coin, p_wallet::extensions.citext, greatest(p_delta, 0))
  on conflict (coin_id, wallet) do update
    set amount = post_coin_holdings.amount + p_delta, updated_at = now();

  if (select amount from public.post_coin_holdings where coin_id = p_coin and wallet = p_wallet) < 0 then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;
end;
$$;

-- ── one coin per post ────────────────────────────────────────────────────────
create or replace function public.ensure_post_coin(p_post_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c_id uuid;
  c_author extensions.citext;
  c_caption text;
  c_name text;
  c_base text;
  c_symbol extensions.citext;
  i integer;
begin
  select id into c_id from public.post_coins where post_id = p_post_id;
  if c_id is not null then
    return c_id;
  end if;

  select author_wallet, caption into c_author, c_caption
    from public.posts where id = p_post_id;
  if c_author is null then
    raise exception 'POST_NOT_FOUND';
  end if;

  c_name := left(coalesce(nullif(btrim(c_caption), ''), 'Post'), 60);

  c_base := 'P' || upper(left(regexp_replace(p_post_id, '[^a-zA-Z0-9]', '', 'g'), 9));
  if char_length(c_base) < 2 then
    c_base := 'POST';
  end if;
  c_base := left(c_base, 10);

  c_symbol := c_base;
  for i in 1..20 loop
    if not exists (select 1 from public.post_coins where symbol = c_symbol) then
      exit;
    end if;
    c_symbol := left(c_base, 10 - length(i::text)) || i::text;
  end loop;

  insert into public.post_coins (post_id, owner_wallet, name, symbol)
  values (p_post_id, c_author, c_name, c_symbol)
  returning id into c_id;

  insert into public.post_coin_holdings (coin_id, wallet, amount)
  values (c_id, c_author, (select total_supply from public.post_coins where id = c_id));

  -- Do NOT write post_coins.id into posts.coin_id: that column may still have a
  -- legacy FK to public.coins. The link is post_coins.post_id → posts.id.

  return c_id;
end;
$$;

create or replace function public.on_post_created_coin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_post_coin(new.id);
  return null;
end;
$$;

drop trigger if exists posts_post_coin on public.posts;
create trigger posts_post_coin
  after insert on public.posts
  for each row execute function public.on_post_created_coin();

-- backfill existing live posts
do $$
declare
  r record;
begin
  for r in select id from public.posts loop
    perform public.ensure_post_coin(r.id);
  end loop;
end;
$$;

-- ── trade (bonding curve) ────────────────────────────────────────────────────
create or replace function public.trade_post_coin(
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
  v_post_id text;
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

  select * into c from public.post_coins where id = p_coin for update;
  if not found then
    raise exception 'COIN_NOT_FOUND';
  end if;
  v_coin_id := c.id;
  v_post_id := c.post_id;

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

    perform public.adjust_post_coin_holding(v_coin_id, p_trader, units);

    update public.post_coins
      set reserve_mst = new_reserve,
          total_supply = new_supply,
          price_mst = round((new_reserve * new_reserve) / k, 18)
    where id = v_coin_id;

    insert into public.post_coin_trades
      (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
    values
      (v_coin_id, 'buy', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, spend, settled);

    update public.posts set collect_count = collect_count + 1 where id = v_post_id;

    select amount into hold
      from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;

    return jsonb_build_object(
      'side', 'buy',
      'amount', units,
      'totalMst', spend,
      'price', round((new_reserve * new_reserve) / k, 18),
      'holding', hold
    );
  end if;

  select amount into have
    from public.post_coin_holdings where coin_id = c.id and wallet = p_trader;
  have := coalesce(have, 0);
  if have < p_amount then
    raise exception 'INSUFFICIENT_COIN_BALANCE';
  end if;

  units := round(p_amount, 8);

  proceeds := round((c.total_supply * units) / (c.total_supply + units) - c.reserve_mst, 18);
  if proceeds < 0 then
    raise exception 'POOL_EMPTY';
  end if;

  new_reserve := c.reserve_mst - proceeds;
  new_supply := c.total_supply + units;
  if new_reserve < 0 then
    raise exception 'POOL_EMPTY';
  end if;

  perform public.adjust_post_coin_holding(v_coin_id, p_trader, -units);

  update public.post_coins
    set reserve_mst = new_reserve,
        total_supply = new_supply,
        price_mst = round((new_reserve * new_reserve) / k, 18)
  where id = v_coin_id;

  insert into public.post_coin_trades
    (coin_id, side, trader_wallet, counterparty_wallet, amount, price_mst, total_mst, settlement)
  values
    (v_coin_id, 'sell', p_trader::extensions.citext, c.owner_wallet, units, c.price_mst, proceeds, settled);

  select amount into hold
    from public.post_coin_holdings where coin_id = v_coin_id and wallet = p_trader;

  return jsonb_build_object(
    'side', 'sell',
    'amount', units,
    'totalMst', proceeds,
    'price', round((new_reserve * new_reserve) / k, 18),
    'holding', hold
  );
end;
$$;

create index if not exists post_coins_post on public.post_coins (post_id);
create index if not exists post_coin_trades_coin_created on public.post_coin_trades (coin_id, created_at desc);

alter table public.post_coins enable row level security;
alter table public.post_coin_holdings enable row level security;
alter table public.post_coin_trades enable row level security;

revoke all on table public.post_coins from anon, authenticated;
revoke all on table public.post_coin_holdings from anon, authenticated;
revoke all on table public.post_coin_trades from anon, authenticated;
