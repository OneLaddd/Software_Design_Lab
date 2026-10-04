-- Permissions for the Search & Explore screens.
-- Safe to rerun; row-level policies continue to define the permitted rows.

create table if not exists public.community_members (
  user_id uuid references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (user_id, community_id)
);

alter table public.community_members enable row level security;
drop policy if exists "memberships are public" on public.community_members;
create policy "memberships are public" on public.community_members
  for select using (true);
drop policy if exists "users manage own memberships" on public.community_members;
create policy "users manage own memberships" on public.community_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select (id, username, avatar_url, active_role, bio, created_at)
  on public.profiles to authenticated;

grant select (id, slug, name, description, icon_url, created_at)
  on public.communities to authenticated;
grant select (user_id, community_id, joined_at)
  on public.community_members to authenticated;
grant insert (user_id, community_id)
  on public.community_members to authenticated;
grant delete on public.community_members to authenticated;

grant select (id, title, description, budget_min, budget_max, currency, status, created_at, client_id)
  on public.service_requests to authenticated;
grant select (request_id, category_id)
  on public.request_categories to authenticated;
