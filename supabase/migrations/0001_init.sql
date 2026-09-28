-- MSTORA initial schema: wallet-native Web2 backend.
-- Identity is the wallet address (primary key). No email, no password.
-- All reads/writes go through server code with the Supabase secret key.
-- RLS is enabled with no client policies, so browser PostgREST access is closed.

create extension if not exists citext with schema extensions;

-- ── enums ────────────────────────────────────────────────────────────────────
create type public.post_kind as enum ('photo', 'video', 'text');
create type public.orbit_role as enum ('user', 'assistant');

-- ── profiles ─────────────────────────────────────────────────────────────────
-- wallet_address is either an EVM address (0x + 40 hex) or a reserved
-- 'seed:' handle for the wallet-less demo creators in lib/data.ts.
-- citext keeps 0xAbC… and 0xabc… from becoming two different profiles.
create table public.profiles (
  wallet_address extensions.citext primary key,
  username extensions.citext not null unique,
  phone text unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  location text,
  verified boolean not null default false,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  joined_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_wallet_format check (
    wallet_address::text ~ '^0x[0-9a-fA-F]{40}$'
    or wallet_address::text ~ '^seed:[a-z0-9_]{1,30}$'
  ),
  constraint profiles_username_format check (username::text ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- ── posts ────────────────────────────────────────────────────────────────────
-- id is text so seeded '/post/p1' … '/post/p32' URLs keep working.
-- New posts use a crypto.randomUUID() string.
-- coin_id is reserved for the mock coin ids in lib/data.ts; coins stay mock.
create table public.posts (
  id text primary key,
  author_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  caption text not null default '',
  kind public.post_kind not null default 'photo',
  image_url text,
  coin_id text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  share_count integer not null default 0,
  collect_count integer not null default 0,
  created_at timestamptz not null default now(),

  constraint posts_id_not_draft check (id !~ '^draft_'),
  constraint posts_caption_len check (char_length(caption) <= 5000),
  constraint posts_photo_needs_image check (kind <> 'photo' or image_url is not null)
);

-- ── likes ────────────────────────────────────────────────────────────────────
-- Composite PK makes a double-like impossible; unlike is a plain DELETE.
create table public.likes (
  profile_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  post_id text not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_wallet, post_id)
);

-- ── comments (flat; no parent_id by design) ──────────────────────────────────
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null references public.posts(id) on delete cascade,
  author_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 2000)
);

-- ── orbit chat history, per wallet ───────────────────────────────────────────
-- Multiple conversations: "New chat" inserts a row instead of deleting history.
create table public.orbit_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The client TextMsg has no id/timestamp, so the server assigns seq.
-- model comes from the X-Orbit-Model response header.
create table public.orbit_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.orbit_conversations(id) on delete cascade,
  role public.orbit_role not null,
  content text not null,
  model text,
  seq integer not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

-- ── follows ──────────────────────────────────────────────────────────────────
create table public.follows (
  follower_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  followee_wallet extensions.citext not null references public.profiles(wallet_address) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_wallet, followee_wallet),
  constraint follows_not_self check (follower_wallet <> followee_wallet)
);

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();
create trigger orbit_conversations_touch before update on public.orbit_conversations
  for each row execute function public.touch_updated_at();

-- ── denormalized counters ────────────────────────────────────────────────────
create or replace function public.sync_post_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.posts p set
    like_count = (select count(*) from public.likes where post_id = pid),
    comment_count = (select count(*) from public.comments where post_id = pid)
  where p.id = pid;
  return null;
end;
$$;

create trigger likes_sync after insert or delete on public.likes
  for each row execute function public.sync_post_count();
create trigger comments_sync after insert or delete on public.comments
  for each row execute function public.sync_post_count();

create or replace function public.sync_follow_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1
      where wallet_address = new.followee_wallet;
    update public.profiles set following_count = following_count + 1
      where wallet_address = new.follower_wallet;
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0)
      where wallet_address = old.followee_wallet;
    update public.profiles set following_count = greatest(following_count - 1, 0)
      where wallet_address = old.follower_wallet;
  end if;
  return null;
end;
$$;

create trigger follows_sync after insert or delete on public.follows
  for each row execute function public.sync_follow_counts();

create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.orbit_conversations set updated_at = now() where id = new.conversation_id;
  return null;
end;
$$;

create trigger orbit_messages_touch after insert on public.orbit_messages
  for each row execute function public.touch_conversation();

-- ── indexes ──────────────────────────────────────────────────────────────────
create index posts_author_created on public.posts (author_wallet, created_at desc);
create index posts_created on public.posts (created_at desc);
create index comments_post_created on public.comments (post_id, created_at);
create index likes_post on public.likes (post_id);
create index orbit_conv_profile_updated on public.orbit_conversations (profile_wallet, updated_at desc);
create index orbit_msg_conv_seq on public.orbit_messages (conversation_id, seq);

-- ── lockdown: service key bypasses RLS; browser keys get nothing ─────────────
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.orbit_conversations enable row level security;
alter table public.orbit_messages enable row level security;
alter table public.follows enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── storage for optional avatar and post media ───────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/avif']),
  ('post-media', 'post-media', true, 15728640, array['image/jpeg','image/png','image/webp','image/avif','video/mp4'])
on conflict (id) do nothing;
