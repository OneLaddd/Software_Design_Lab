-- Profile pages can display completed commission summaries without granting
-- public access to order rows or exposing amounts and other private fields.
-- RLS policies need matching SQL table privileges before authenticated clients
-- can read the public profile sections.
-- These profile sections are created by sections 3, 5, and 6 of the master
-- schema. Create their read-side tables here too if those sections were skipped.
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-zA-Z0-9_]{2,30}$'),
  name text not null,
  description text,
  icon_url text,
  created_at timestamptz default now()
);

alter table public.communities enable row level security;
drop policy if exists "communities are public" on public.communities;
create policy "communities are public" on public.communities
  for select using (true);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) not null,
  community_id uuid references public.communities(id),
  title text,
  body text,
  media_url text,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;
drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts
  for select using (true);

create table if not exists public.portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  subtitle text,
  category_id uuid references public.categories(id),
  image_url text,
  description text,
  skills text[] not null default '{}',
  project_url text,
  created_at timestamptz default now()
);

alter table public.portfolio_entries
  add column if not exists description text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists project_url text;

alter table public.portfolio_entries enable row level security;
drop policy if exists "portfolio entries are public" on public.portfolio_entries;
create policy "portfolio entries are public" on public.portfolio_entries
  for select using (true);
drop policy if exists "users manage own portfolio" on public.portfolio_entries;
create policy "users manage own portfolio" on public.portfolio_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.portfolio_entries to authenticated;
grant select on public.posts, public.categories, public.communities to authenticated;

drop function if exists public.get_public_profile_commissions(uuid);
create or replace function public.get_public_profile_commissions(p_profile_id uuid)
returns table (id uuid, request_id uuid, title text, role text, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view profile commissions';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    return;
  end if;

  return query
  select o.id, o.request_id, sr.title,
    case when o.client_id = p_profile_id then 'client'::text else 'hunter'::text end,
    coalesce(o.updated_at, o.delivered_at, o.created_at)
  from public.orders o
  left join public.service_requests sr on sr.id = o.request_id
  where (o.client_id = p_profile_id or o.hunter_id = p_profile_id)
    and o.status = 'completed'
  order by coalesce(o.updated_at, o.delivered_at, o.created_at) desc;
end;
$$;

revoke all on function public.get_public_profile_commissions(uuid) from public;
grant execute on function public.get_public_profile_commissions(uuid) to authenticated;

create unique index if not exists notifications_one_bid_invitation
  on public.notifications (user_id, related_id)
  where type = 'bid_invitation';

create or replace function public.invite_hunter_to_request(p_request_id uuid, p_hunter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_client_username text;
begin
  if auth.uid() is null then raise exception 'Sign in to invite a Hunter'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.active_role = 'client') then
    raise exception 'Switch to your Client role to invite a Hunter';
  end if;
  if p_hunter_id = auth.uid() then raise exception 'You cannot invite yourself'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_hunter_id and p.active_role = 'hunter'
  ) then raise exception 'This profile is not currently a Hunter'; end if;

  select sr.title into v_title
  from public.service_requests sr
  where sr.id = p_request_id and sr.client_id = auth.uid() and sr.status = 'open'
  for update;
  if not found then raise exception 'Only the owner can invite a Hunter to an open request'; end if;

  if exists (
    select 1 from public.bids b
    where b.request_id = p_request_id and b.hunter_id = p_hunter_id
  ) then raise exception 'This Hunter has already placed a bid'; end if;

  select p.username into v_client_username from public.profiles p where p.id = auth.uid();
  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    p_hunter_id,
    'bid_invitation',
    'You were invited to bid',
    '@' || coalesce(v_client_username, 'A client') || ' invited you to bid on “' || coalesce(v_title, 'a request') || '”. Open the request to review the details.',
    p_request_id
  )
  on conflict (user_id, related_id) where type = 'bid_invitation' do nothing;
  if not found then raise exception 'This Hunter has already been invited'; end if;
end;
$$;

create or replace function public.get_my_bid_invitation_request_ids(p_hunter_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view invitations'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_hunter_id and p.active_role = 'hunter') then
    raise exception 'This profile is not currently a Hunter';
  end if;
  return query
  select n.related_id
  from public.notifications n
  join public.service_requests sr on sr.id = n.related_id
  where n.user_id = p_hunter_id and n.type = 'bid_invitation'
    and sr.client_id = auth.uid();
end;
$$;

revoke all on function public.invite_hunter_to_request(uuid, uuid) from public;
revoke all on function public.get_my_bid_invitation_request_ids(uuid) from public;
grant execute on function public.invite_hunter_to_request(uuid, uuid) to authenticated;
grant execute on function public.get_my_bid_invitation_request_ids(uuid) to authenticated;
