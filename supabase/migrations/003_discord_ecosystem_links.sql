-- Run this migration on the shared Zuzify Supabase project used by the websites.
-- Only the bot's service-role connection can read/write these private tables.
create table if not exists public.bot_ecosystem_links (
 id uuid primary key default gen_random_uuid(),
 discord_user_id text not null check (discord_user_id ~ '^[0-9]{15,25}$'),
 service text not null check (service in ('prezzstore','zuzifysocials','zuzuos','fastproxy')),
 user_id uuid not null references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now(),
 unique(discord_user_id,service),
 unique(service,user_id)
);
create index if not exists bot_ecosystem_links_user_idx on public.bot_ecosystem_links(user_id);
create table if not exists public.bot_link_challenges (
 code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
 discord_user_id text not null check (discord_user_id ~ '^[0-9]{15,25}$'),
 service text not null check (service in ('prezzstore','zuzifysocials','zuzuos','fastproxy')),
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists bot_link_challenges_expiry_idx on public.bot_link_challenges(expires_at);
create index if not exists bot_link_challenges_owner_idx on public.bot_link_challenges(discord_user_id,created_at desc);
alter table public.bot_ecosystem_links enable row level security;
alter table public.bot_link_challenges enable row level security;
revoke all on public.bot_ecosystem_links, public.bot_link_challenges from anon,authenticated,public;
grant select,insert,update,delete on public.bot_ecosystem_links,public.bot_link_challenges to service_role;
