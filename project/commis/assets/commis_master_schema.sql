-- =====================================================================
-- COMMIS — MASTER SUPABASE SQL SCRIPT
-- Run each numbered section in order, top to bottom, in the SQL Editor.
-- Section 1 (profiles) you've already run — included for completeness,
-- skip it if your profiles table already matches this.
-- =====================================================================


-- =====================================================================
-- 1. PROFILES (already run — skip if done)
-- =====================================================================

create table if not exists profiles (
  id uuid references auth.users primary key,
  username text unique,
  avatar_url text,
  bio text,
  active_role text default 'hunter',
  created_at timestamptz default now()
);

revoke update on profiles from authenticated;
grant update (username, avatar_url, bio, active_role) on profiles to authenticated;
revoke insert on profiles from authenticated;

alter table profiles
  add column if not exists is_admin boolean default false,
  add column if not exists hunter_rating numeric default 0 check (hunter_rating between 0 and 5),
  add column if not exists hunter_rating_count int default 0,
  add column if not exists client_rating numeric default 0 check (client_rating between 0 and 5),
  add column if not exists client_rating_count int default 0;

-- Only add these constraints if not already present (will error if duplicate — safe to skip if already run)
alter table profiles
  add constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  add constraint active_role_valid check (active_role in ('client','hunter')),
  add constraint bio_length check (char_length(bio) <= 280);

create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  uname text := new.raw_user_meta_data->>'username';
  r text := coalesce(new.raw_user_meta_data->>'role', 'hunter');
begin
  if r not in ('client','hunter') then r := 'hunter'; end if;
  insert into public.profiles (id, username, active_role)
  values (new.id, uname, r);
  insert into public.notifications (user_id, type, title, body)
  values (
    new.id,
    'welcome',
    case when r = 'client' then 'Welcome to Commis, Client!' else 'Welcome to Commis, Hunter!' end,
    case when r = 'client' then
      'Welcome to Commis. You can post service requests, review bids from Hunters, and build your commissions from the Marketplace.'
    else
      'Welcome to Commis. You can explore the Marketplace, discover service requests, and place bids on commissions that match your skills. You can also showcase your work through Posts and your Portfolio.'
    end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table profiles enable row level security;
create policy "profiles are public" on profiles for select using (true);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
grant select (id, username, avatar_url, bio, active_role, created_at) on public.profiles to authenticated;


-- =====================================================================
-- 2. CATEGORIES (Marketplace taxonomy)
-- =====================================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon_url text,
  created_at timestamptz default now()
);

alter table categories enable row level security;
create policy "categories are public" on categories for select using (true);
grant select on public.categories to authenticated;

insert into categories (slug, name) values
  ('graphic-design', 'Graphic Design'),
  ('illustration', 'Illustration'),
  ('logo-design', 'Logo Design'),
  ('ui-ux-design', 'UI/UX Design'),
  ('3d-animation', '3D & Animation'),
  ('photography', 'Photography'),
  ('video-editing', 'Video Editing'),
  ('web-development', 'Web Development'),
  ('app-development', 'App Development'),
  ('game-development', 'Game Development'),
  ('data-entry-analysis', 'Data Entry & Analysis'),
  ('writing-editing', 'Writing & Editing'),
  ('translation', 'Translation'),
  ('voice-over', 'Voice Over'),
  ('music-composition', 'Music Composition'),
  ('tutoring', 'Tutoring'),
  ('research-assistance', 'Research Assistance'),
  ('thesis-formatting', 'Thesis & Paper Formatting'),
  ('virtual-assistance', 'Virtual Assistance'),
  ('social-media-management', 'Social Media Management'),
  ('presentation-design', 'Presentation Design')
on conflict (slug) do nothing;


-- =====================================================================
-- 3. COMMUNITIES (Posts-feed topics)
-- =====================================================================

create table communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-zA-Z0-9_]{2,30}$'),
  name text not null,
  description text,
  icon_url text,
  banner_url text,
  created_at timestamptz default now()
);

create table community_members (
  user_id uuid references profiles(id) on delete cascade,
  community_id uuid references communities(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (user_id, community_id)
);

alter table communities enable row level security;
alter table community_members enable row level security;

grant select on public.communities to authenticated;
grant select (user_id, community_id, joined_at) on public.community_members to authenticated;
grant insert (user_id, community_id) on public.community_members to authenticated;
grant delete on public.community_members to authenticated;

create policy "communities are public" on communities for select using (true);
create policy "memberships are public" on community_members for select using (true);
create policy "users manage own memberships" on community_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into communities (slug, name, description) values
  ('programming', 'c/programming', 'Code, dev projects, and tech discussions'),
  ('photography', 'c/Photography', 'Share your shots and photo techniques'),
  ('graphicdesign', 'c/GraphicDesign', 'Design work, critiques, and inspiration'),
  ('illustration', 'c/Illustration', 'Digital and traditional art showcases'),
  ('webdev', 'c/WebDev', 'Web projects, frameworks, and site showcases'),
  ('music', 'c/Music', 'Original compositions and audio work'),
  ('writing', 'c/Writing', 'Short stories, articles, and writing showcases'),
  ('videoediting', 'c/VideoEditing', 'Edits, reels, and video projects'),
  ('gamedev', 'c/GameDev', 'Game projects and dev logs'),
  ('students', 'c/Students', 'Student life, coursework, and campus topics')
on conflict (slug) do nothing;


-- =====================================================================
-- 4. SERVICE REQUESTS, BIDS (Marketplace)
-- =====================================================================

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) not null,
  title text not null,
  description text not null,
  budget_min numeric,
  budget_max numeric,
  currency text default 'PHP',
  status text default 'open' check (status in ('open','closed','awarded')),
  created_at timestamptz default now()
);

create table request_categories (
  request_id uuid references service_requests(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  primary key (request_id, category_id)
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references service_requests(id) on delete cascade,
  hunter_id uuid references profiles(id) not null,
  amount numeric not null,
  message text,
  status text default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now()
);

alter table service_requests enable row level security;
alter table request_categories enable row level security;
alter table bids enable row level security;

create policy "requests are public" on service_requests for select using (true);
grant select (id, client_id, title, description, budget_min, budget_max, currency, status, created_at) on public.service_requests to authenticated;
create policy "clients create own requests" on service_requests for insert with check (auth.uid() = client_id);
create policy "clients update own requests" on service_requests for update using (auth.uid() = client_id);

create policy "request categories are public" on request_categories for select using (true);
grant select (request_id, category_id) on public.request_categories to authenticated;
create policy "clients tag own requests" on request_categories for insert
  with check (exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));
create policy "clients untag own requests" on request_categories for delete
  using (exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));

create policy "bids visible to request owner and bidder" on bids for select
  using (auth.uid() = hunter_id or exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));
create policy "hunters create own bids" on bids for insert with check (auth.uid() = hunter_id);
create policy "hunters update own pending bids" on bids for update
  using (auth.uid() = hunter_id and status = 'pending');

grant select (id, request_id, hunter_id) on public.bids to authenticated;
grant update (amount, message) on public.bids to authenticated;


-- =====================================================================
-- 5. POSTS, VOTES, COMMENTS (Showcase feed)
-- =====================================================================

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) not null,
  community_id uuid references communities(id),
  title text,
  body text,
  media_url text,
  view_count bigint not null default 0,
  created_at timestamptz default now()
);

create table votes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  value smallint not null check (value in (-1,1)),
  primary key (post_id, user_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) not null,
  parent_comment_id uuid references comments(id),
  body text not null,
  created_at timestamptz default now()
);

create table post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  media_url text not null,
  position int not null default 0,
  created_at timestamptz default now()
);

create or replace function public.increment_post_view(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set view_count = view_count + 1 where id = p_post_id;
end;
$$;
grant execute on function public.increment_post_view(uuid) to authenticated, anon;

alter table posts enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table post_media enable row level security;

create policy "posts are public" on posts for select using (true);
grant select on public.posts to authenticated;
create policy "users create own posts" on posts for insert with check (auth.uid() = author_id);
create policy "users update own posts" on posts for update using (auth.uid() = author_id);
create policy "users delete own posts" on posts for delete using (auth.uid() = author_id);
grant select, insert, update, delete on public.posts to authenticated;

create policy "votes are public" on votes for select using (true);
create policy "users manage own votes" on votes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.votes to authenticated;

create policy "comments are public" on comments for select using (true);
create policy "users create own comments" on comments for insert with check (auth.uid() = author_id);
create policy "users update own comments" on comments for update using (auth.uid() = author_id);
create policy "users delete own comments" on comments for delete using (auth.uid() = author_id);
grant select, insert, update, delete on public.comments to authenticated;

create policy "post media is public" on post_media for select using (true);
create policy "authors manage own post media" on post_media for all
  using (exists(select 1 from posts where id = post_id and author_id = auth.uid()))
  with check (exists(select 1 from posts where id = post_id and author_id = auth.uid()));
grant select, insert, update, delete on public.post_media to authenticated;

create or replace function public.save_post_with_media(
  p_post_id uuid,
  p_community_id uuid,
  p_title text,
  p_body text,
  p_media_urls text[]
) returns uuid
language plpgsql
set search_path = public
as $$
declare saved_post_id uuid;
begin
  if char_length(btrim(coalesce(p_title, ''))) < 5 or char_length(btrim(p_title)) > 300 then
    raise exception 'Post title must be between 5 and 300 characters';
  end if;
  if coalesce(cardinality(p_media_urls), 0) > 4 then
    raise exception 'A post can contain at most four images';
  end if;
  if p_post_id is null then
    insert into public.posts(author_id, community_id, title, body, media_url)
      values (auth.uid(), p_community_id, btrim(p_title), nullif(btrim(p_body), ''), p_media_urls[1]) returning id into saved_post_id;
  else
    update public.posts set community_id=p_community_id,title=btrim(p_title),body=nullif(btrim(p_body),''),media_url=p_media_urls[1]
      where id=p_post_id and author_id=auth.uid() returning id into saved_post_id;
    if saved_post_id is null then raise exception 'Post not found or current user is not its author'; end if;
    delete from public.post_media where post_id=saved_post_id;
  end if;
  insert into public.post_media(post_id,media_url,position)
    select saved_post_id,media_url,ordinality-1 from unnest(coalesce(p_media_urls,array[]::text[])) with ordinality as items(media_url,ordinality);
  return saved_post_id;
end;
$$;
revoke all on function public.save_post_with_media(uuid, uuid, text, text, text[]) from public;
grant execute on function public.save_post_with_media(uuid, uuid, text, text, text[]) to authenticated;


-- =====================================================================
-- 6. PORTFOLIO ENTRIES
-- =====================================================================

create table portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  subtitle text,
  category_id uuid references categories(id),
  image_url text,
  description text,
  skills text[] not null default '{}',
  project_url text,
  created_at timestamptz default now()
);

alter table portfolio_entries enable row level security;
create policy "portfolio entries are public" on portfolio_entries for select using (true);
grant select, insert, update, delete on public.portfolio_entries to authenticated;
create policy "users manage own portfolio" on portfolio_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- =====================================================================
-- 7. ORDERS + DELIVERABLES
-- =====================================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references service_requests(id),
  bid_id uuid references bids(id) unique,
  client_id uuid references profiles(id) not null,
  hunter_id uuid references profiles(id) not null,
  amount numeric not null,
  status text not null default 'created'
    check (status in ('created','escrow_locked','in_progress','delivered','completed','disputed','cancelled')),
  delivered_at timestamptz,
  auto_release_at timestamptz,
  team_fee_amount numeric,
  cancelled_at timestamptz,
  cancelled_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table orders enable row level security;
alter table deliverables enable row level security;

create policy "participants view own orders" on orders for select
  using (auth.uid() = client_id or auth.uid() = hunter_id or exists(select 1 from profiles where id = auth.uid() and is_admin));
grant select on public.orders to authenticated;
create policy "participants view deliverables" on deliverables for select
  using (exists(select 1 from orders o where o.id = deliverables.order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())));
create policy "participants upload deliverables" on deliverables for insert
  with check (exists(select 1 from orders o where o.id = order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())));
create policy "hunters remove own in progress deliverables" on deliverables for delete
  using (
    uploaded_by = auth.uid()
    and exists(
      select 1 from orders o
      where o.id = deliverables.order_id
        and o.hunter_id = auth.uid()
        and o.status = 'in_progress'
    )
  );
grant select (id, order_id, file_url, file_name, file_size_bytes, uploaded_by, created_at) on public.deliverables to authenticated;
grant insert (order_id, file_url, file_name, file_size_bytes, uploaded_by) on public.deliverables to authenticated;
grant delete on public.deliverables to authenticated;
-- No direct INSERT/UPDATE policy on orders for regular users — all writes go through
-- the SECURITY DEFINER functions in Section 10, which bypass RLS by design.


-- =====================================================================
-- 8. REVIEWS (dual rating system)
-- =====================================================================

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  reviewer_id uuid references profiles(id) not null,
  reviewee_id uuid references profiles(id) not null,
  reviewed_role text not null check (reviewed_role in ('client','hunter')),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  unique (order_id, reviewer_id),
  created_at timestamptz default now()
);

alter table reviews enable row level security;
create policy "reviews are public" on reviews for select using (true);
grant select on public.reviews to authenticated;
create policy "order participants leave reviews" on reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists(
      select 1 from orders o where o.id = order_id
        and (
          (o.status = 'completed' and (
            (o.client_id = auth.uid() and reviewee_id = o.hunter_id and reviewed_role = 'hunter')
            or (o.hunter_id = auth.uid() and reviewee_id = o.client_id and reviewed_role = 'client')
          ))
          or (o.status = 'cancelled' and o.hunter_id = auth.uid()
            and reviewee_id = o.client_id and reviewed_role = 'client')
        )
    )
  );

create or replace function public.update_rating()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.reviewed_role = 'hunter' then
    update public.profiles set
      hunter_rating = (select avg(rating) from public.reviews where reviewee_id = new.reviewee_id and reviewed_role = 'hunter'),
      hunter_rating_count = hunter_rating_count + 1
    where id = new.reviewee_id;
  else
    update public.profiles set
      client_rating = (select avg(rating) from public.reviews where reviewee_id = new.reviewee_id and reviewed_role = 'client'),
      client_rating_count = client_rating_count + 1
    where id = new.reviewee_id;
  end if;
  return new;
end $$;

drop trigger if exists on_review_insert on reviews;
create trigger on_review_insert
  after insert on reviews
  for each row execute function public.update_rating();


-- =====================================================================
-- 9. WALLETS + TRANSACTIONS
-- =====================================================================

create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  available_balance numeric not null default 0,
  escrow_balance numeric not null default 0,
  updated_at timestamptz default now()
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  type text not null check (type in ('deposit','withdrawal','escrow_lock','escrow_release','commission_payment','platform_fee')),
  amount numeric not null,
  description text,
  order_id uuid references orders(id),
  created_at timestamptz default now()
);

alter table wallets enable row level security;
alter table wallet_transactions enable row level security;

create policy "users view own wallet" on wallets for select using (auth.uid() = user_id);
create policy "users view own transactions" on wallet_transactions for select using (auth.uid() = user_id);
-- No direct write policies — all writes go through Section 10's functions.

grant select on public.wallets, public.wallet_transactions to authenticated;

-- Auto-create a wallet row whenever a profile is created
create or replace function public.handle_new_wallet()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;

drop trigger if exists on_profile_created_wallet on profiles;
create trigger on_profile_created_wallet
  after insert on profiles
  for each row execute function public.handle_new_wallet();

insert into public.wallets (user_id)
select id from public.profiles
on conflict (user_id) do nothing;


-- =====================================================================
-- 10. ADMIN FLAG + FUNDS/ORDER FUNCTIONS
-- =====================================================================
-- IMPORTANT: create the headadmin@commis.com account first (normal signup
-- or Supabase dashboard "Add user"), THEN run this UPDATE:
--
-- update profiles set is_admin = true
-- where id = (select id from auth.users where email = 'headadmin@commis.com');

create or replace function public.accept_bid(p_bid_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_request_id uuid; v_client_id uuid; v_hunter_id uuid; v_amount numeric; v_order_id uuid;
  v_request_title text; v_client_username text; v_hunter_username text;
begin
  select request_id, hunter_id, amount into v_request_id, v_hunter_id, v_amount
  from public.bids where id = p_bid_id and status = 'pending';
  if v_request_id is null then raise exception 'Bid not found or already resolved'; end if;

  select client_id, title into v_client_id, v_request_title
  from public.service_requests where id = v_request_id;
  if v_client_id != auth.uid() then raise exception 'Only the request owner can accept a bid'; end if;

  update public.bids set status = 'accepted' where id = p_bid_id;
  update public.bids set status = 'rejected' where request_id = v_request_id and id != p_bid_id and status = 'pending';
  update public.service_requests set status = 'awarded' where id = v_request_id;

  insert into public.orders (request_id, bid_id, client_id, hunter_id, amount)
  values (v_request_id, p_bid_id, v_client_id, v_hunter_id, v_amount)
  returning id into v_order_id;

  select username into v_client_username from public.profiles where id = v_client_id;
  select username into v_hunter_username from public.profiles where id = v_hunter_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    v_hunter_id,
    'bid_accepted_hunter',
    'Your bid was accepted!',
    '@' || coalesce(v_client_username, 'client') || ' hired you for ' || coalesce(v_request_title, 'your request') || ' - ' || chr(8369) || v_amount::text,
    v_order_id
  );

  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    v_client_id,
    'bid_accepted_client',
    'You hired @' || coalesce(v_hunter_username, 'hunter'),
    'Work begins once you lock escrow.',
    v_order_id
  );

  return v_order_id;
end $$;

create or replace function public.lock_escrow(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_client_id uuid; v_amount numeric; v_admin_id uuid; v_balance numeric;
begin
  select client_id, amount into v_client_id, v_amount
  from public.orders where id = p_order_id and status = 'created' for update;
  if not found then raise exception 'This commission is no longer awaiting escrow'; end if;
  if v_client_id != auth.uid() then raise exception 'Only the client can lock escrow for this order'; end if;

  select available_balance into v_balance from public.wallets where user_id = v_client_id;
  if v_balance < v_amount then raise exception 'Insufficient funds'; end if;

  select id into v_admin_id from public.profiles where is_admin = true limit 1;

  update public.wallets set available_balance = available_balance - v_amount
  where user_id = v_client_id and available_balance >= v_amount;
  if not found then raise exception 'Insufficient funds'; end if;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_client_id, 'escrow_lock', -v_amount, 'Escrow locked for order', p_order_id);

  update public.wallets set escrow_balance = escrow_balance + v_amount where user_id = v_admin_id;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_admin_id, 'escrow_lock', v_amount, 'Holding escrow for order', p_order_id);

  update public.orders set status = 'escrow_locked', updated_at = now() where id = p_order_id;
end $$;

create or replace function public.start_work(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.orders set status = 'in_progress', updated_at = now()
  where id = p_order_id and hunter_id = auth.uid() and status = 'escrow_locked';
end $$;

create or replace function public.submit_delivery(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.orders
  set status = 'delivered', delivered_at = now(), auto_release_at = now() + interval '72 hours', updated_at = now()
  where id = p_order_id and hunter_id = auth.uid() and status = 'in_progress';
end $$;

create or replace function public.release_escrow(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_client_id uuid; v_hunter_id uuid; v_amount numeric; v_fee numeric; v_hunter_amount numeric; v_admin_id uuid; v_status text;
begin
  select client_id, hunter_id, amount, status into v_client_id, v_hunter_id, v_amount, v_status
  from public.orders where id = p_order_id for update;
  if not found or v_status <> 'delivered' then raise exception 'Only delivered commissions can release escrow'; end if;
  if auth.uid() is not null and auth.uid() <> v_client_id
    and not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only the client or an admin can release this escrow';
  end if;

  select id into v_admin_id from public.profiles where is_admin = true order by created_at limit 1;
  if v_admin_id is null then raise exception 'The Commis Team escrow account was not found'; end if;
  v_fee := round(v_amount * 0.10, 2);
  v_hunter_amount := v_amount - v_fee;

  update public.wallets set escrow_balance = escrow_balance - v_amount,
    available_balance = available_balance + v_fee, updated_at = now()
  where user_id = v_admin_id and escrow_balance >= v_amount;
  if not found then raise exception 'The escrow wallet does not contain the full commission amount'; end if;

  update public.wallets set available_balance = available_balance + v_hunter_amount, updated_at = now()
  where user_id = v_hunter_id;
  if not found then raise exception 'Hunter wallet was not found'; end if;

  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values
    (v_admin_id, 'escrow_release', -v_amount, 'Escrow settled for completed commission', p_order_id),
    (v_admin_id, 'platform_fee', v_fee, 'Commis Team 10% service fee', p_order_id),
    (v_hunter_id, 'commission_payment', v_hunter_amount, 'Commission payment after 10% Commis Team fee', p_order_id);

  update public.orders set status = 'completed', team_fee_amount = v_fee, updated_at = now()
  where id = p_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (v_client_id, 'commission_settled_client', 'Commission completed',
      'The commission was completed. The Commis Team received 10% (' || v_fee::text || '), and the Hunter received 90% (' || v_hunter_amount::text || ').', p_order_id),
    (v_hunter_id, 'commission_settled_hunter', 'Commission payment received',
      'Your payment is ' || v_hunter_amount::text || ' after the Commis Team''s 10% service fee (' || v_fee::text || ').', p_order_id),
    (v_admin_id, 'commission_platform_fee', 'Commis Team fee earned',
      'The Commis Team received its 10% service fee (' || v_fee::text || ') from a completed commission.', p_order_id);
end $$;

revoke all on function public.release_escrow(uuid) from public;
grant execute on function public.release_escrow(uuid) to authenticated, service_role;

create or replace function public.withdraw_funds(p_amount numeric)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  update public.wallets set available_balance = available_balance - p_amount
  where user_id = auth.uid() and available_balance >= p_amount;
  if not found then raise exception 'Insufficient funds'; end if;

  insert into public.wallet_transactions (user_id, type, amount, description)
  values (auth.uid(), 'withdrawal', -p_amount, 'Withdrawal');
end $$;

create or replace function public.deposit_funds(p_amount numeric)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  update public.wallets set available_balance = available_balance + p_amount where user_id = auth.uid();
  if not found then raise exception 'Wallet not found'; end if;

  insert into public.wallet_transactions (user_id, type, amount, description)
  values (auth.uid(), 'deposit', p_amount, 'Top-up deposit to balance');
end $$;

grant execute on function public.deposit_funds(numeric) to authenticated;
grant execute on function public.withdraw_funds(numeric) to authenticated;


-- =====================================================================
-- 11. DISPUTES
-- =====================================================================

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) unique not null,
  filed_by uuid references profiles(id) not null,
  reason text not null,
  explanation text,
  status text not null default 'submitted' check (status in ('submitted','under_review','resolution_pending','resolved')),
  resolution text check (resolution in ('refund_client','release_hunter','split')),
  review_started_at timestamptz,
  decision_ready_at timestamptz,
  client_percent numeric,
  hunter_percent numeric,
  team_fee_amount numeric,
  resolution_note text,
  resolved_by uuid references profiles(id),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  constraint disputes_split_percentages_check check (
    (client_percent is null and hunter_percent is null)
    or (client_percent between 0 and 100 and hunter_percent between 0 and 100
      and client_percent + hunter_percent = 100)
  )
);

create table dispute_attachments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references disputes(id) on delete cascade,
  file_url text not null,
  file_name text
);

create table dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references disputes(id) on delete cascade,
  sender_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

alter table disputes enable row level security;
alter table dispute_attachments enable row level security;
alter table dispute_messages enable row level security;

grant select on public.disputes, public.dispute_attachments to authenticated;

create policy "participants view own disputes" on disputes for select
  using (exists(select 1 from orders o where o.id = disputes.order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())) or exists(select 1 from profiles where id = auth.uid() and is_admin));
create policy "participants view dispute attachments" on dispute_attachments for select
  using (exists(select 1 from disputes d join orders o on o.id = d.order_id where d.id = dispute_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())) or exists(select 1 from profiles where id = auth.uid() and is_admin));
create policy "participants view dispute messages" on dispute_messages for select
  using (exists(select 1 from disputes d join orders o on o.id = d.order_id where d.id = dispute_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())) or exists(select 1 from profiles where id = auth.uid() and is_admin));
create policy "participants send dispute messages" on dispute_messages for insert
  with check (exists(select 1 from disputes d join orders o on o.id = d.order_id where d.id = dispute_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())) or exists(select 1 from profiles where id = auth.uid() and is_admin));

create or replace function public.file_dispute(p_order_id uuid, p_reason text, p_explanation text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_dispute_id uuid;
begin
  update public.orders set status = 'disputed', updated_at = now()
  where id = p_order_id and (client_id = auth.uid() or hunter_id = auth.uid());

  insert into public.disputes (order_id, filed_by, reason, explanation)
  values (p_order_id, auth.uid(), p_reason, p_explanation)
  returning id into v_dispute_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  select recipient.user_id, recipient.type, recipient.title, recipient.body, v_dispute_id
  from (
    select o.client_id as user_id,
      'dispute_filed_client'::text as type,
      'Your dispute was submitted'::text as title,
      'Your dispute for ' || coalesce(sr.title, 'this commission') || ' was submitted. View the case and its evidence.' as body
    from public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where o.id = p_order_id
    union all
    select o.hunter_id,
      'dispute_filed_hunter',
      'A dispute was filed for your commission',
      'The client filed a dispute for ' || coalesce(sr.title, 'your commission') || '. View the case and respond.'
    from public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where o.id = p_order_id
    union all
    select p.id,
      'dispute_filed_admin',
      'New dispute needs review',
      'A client filed a dispute for ' || coalesce(sr.title, 'a commission') || '. Review the case.'
    from public.profiles p
    cross join public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where p.is_admin = true and o.id = p_order_id
  ) as recipient;

  return v_dispute_id;
end $$;

create or replace function public.file_dispute_with_attachments(
  p_order_id uuid,
  p_reason text,
  p_explanation text,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_dispute_id uuid;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_prefix text := p_order_id::text || '/' || auth.uid()::text || '/';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to file a dispute';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Choose a reason for the dispute';
  end if;
  if nullif(btrim(p_explanation), '') is null or length(p_explanation) > 1000 then
    raise exception 'Enter an explanation of 1 to 1000 characters';
  end if;
  if jsonb_typeof(v_attachments) is distinct from 'array' then
    raise exception 'Evidence attachments must be a list';
  end if;
  if jsonb_array_length(v_attachments) > 5 then
    raise exception 'You can attach up to 5 evidence files';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_attachments) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or nullif(item.value ->> 'file_url', '') is null
      or left(item.value ->> 'file_url', length(v_prefix)) <> v_prefix
      or not exists (
        select 1 from storage.objects object_row
        where object_row.bucket_id = 'dispute-attachments'
          and object_row.name = item.value ->> 'file_url'
      )
  ) then
    raise exception 'Evidence file path is invalid';
  end if;

  update public.orders
  set status = 'disputed', updated_at = now()
  where id = p_order_id
    and client_id = auth.uid()
    and status in ('in_progress', 'delivered');
  if not found then
    raise exception 'Only the client can dispute an in progress or delivered commission';
  end if;

  insert into public.disputes (order_id, filed_by, reason, explanation)
  values (p_order_id, auth.uid(), p_reason, btrim(p_explanation))
  returning id into v_dispute_id;

  insert into public.dispute_attachments (dispute_id, file_url, file_name)
  select v_dispute_id, item.value ->> 'file_url', item.value ->> 'file_name'
  from jsonb_array_elements(v_attachments) as item(value);

  insert into public.notifications (user_id, type, title, body, related_id)
  select recipient.user_id, recipient.type, recipient.title, recipient.body, v_dispute_id
  from (
    select o.client_id as user_id,
      'dispute_filed_client'::text as type,
      'Your dispute was submitted'::text as title,
      'Your dispute for ' || coalesce(sr.title, 'this commission') || ' was submitted. View the case and its evidence.' as body
    from public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where o.id = p_order_id
    union all
    select o.hunter_id,
      'dispute_filed_hunter',
      'A dispute was filed for your commission',
      'The client filed a dispute for ' || coalesce(sr.title, 'your commission') || '. View the case and respond.'
    from public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where o.id = p_order_id
    union all
    select p.id,
      'dispute_filed_admin',
      'New dispute needs review',
      'A client filed a dispute for ' || coalesce(sr.title, 'a commission') || '. Review the case.'
    from public.profiles p
    cross join public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where p.is_admin = true and o.id = p_order_id
  ) as recipient;

  return v_dispute_id;
end $$;

revoke all on function public.file_dispute_with_attachments(uuid, text, text, jsonb) from public;
grant execute on function public.file_dispute_with_attachments(uuid, text, text, jsonb) to authenticated;

create or replace function public.start_dispute_review(p_dispute_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only an admin can start dispute review';
  end if;
  update public.disputes
  set status = 'under_review', review_started_at = now()
  where id = p_dispute_id and status = 'submitted';
  if not found then raise exception 'This dispute is not awaiting review'; end if;
end $$;

create or replace function public.mark_dispute_decision_pending(p_dispute_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_request_title text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only an admin can advance dispute review';
  end if;
  update public.disputes
  set status = 'resolution_pending', decision_ready_at = now()
  where id = p_dispute_id and status = 'under_review'
  returning order_id into v_order_id;
  if not found then raise exception 'This dispute is not under review'; end if;

  select sr.title into v_request_title
  from public.orders o
  left join public.service_requests sr on sr.id = o.request_id
  where o.id = v_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  select id, 'dispute_decision_needed', 'Dispute decision needed',
    'Review the evidence for ' || coalesce(v_request_title, 'this commission') || ' and set the escrow split.',
    p_dispute_id
  from public.profiles where is_admin = true;
end $$;

create or replace function public.resolve_dispute_split(
  p_dispute_id uuid,
  p_client_percent numeric,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_client_id uuid;
  v_hunter_id uuid;
  v_amount numeric;
  v_team_fee numeric;
  v_distributable numeric;
  v_client_percent numeric;
  v_hunter_percent numeric;
  v_client_amount numeric;
  v_hunter_amount numeric;
  v_admin_id uuid;
  v_status text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only an admin can resolve disputes';
  end if;
  if p_client_percent is null or p_client_percent < 0 or p_client_percent > 100 then
    raise exception 'Client share must be between 0 and 100 percent';
  end if;

  select d.status, d.order_id, o.client_id, o.hunter_id, o.amount
  into v_status, v_order_id, v_client_id, v_hunter_id, v_amount
  from public.disputes d
  join public.orders o on o.id = d.order_id
  where d.id = p_dispute_id
  for update of d, o;
  if not found or v_status <> 'resolution_pending' then
    raise exception 'This dispute is not ready for a decision';
  end if;

  select id into v_admin_id from public.profiles where is_admin = true order by created_at limit 1;
  if v_admin_id is null then raise exception 'The Commis Team escrow account was not found'; end if;
  v_team_fee := round(v_amount * 0.10, 2);
  v_distributable := v_amount - v_team_fee;
  v_client_percent := p_client_percent;
  v_hunter_percent := 100 - v_client_percent;
  v_client_amount := round(v_distributable * v_client_percent / 100, 2);
  v_hunter_amount := v_distributable - v_client_amount;

  update public.wallets
  set escrow_balance = escrow_balance - v_amount,
    available_balance = available_balance + v_team_fee, updated_at = now()
  where user_id = v_admin_id and escrow_balance >= v_amount;
  if not found then raise exception 'The escrow wallet does not contain the full commission amount'; end if;

  update public.wallets
  set available_balance = available_balance + v_client_amount, updated_at = now()
  where user_id = v_client_id;
  if not found then raise exception 'Client wallet was not found'; end if;
  update public.wallets
  set available_balance = available_balance + v_hunter_amount, updated_at = now()
  where user_id = v_hunter_id;
  if not found then raise exception 'Hunter wallet was not found'; end if;

  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values
    (v_admin_id, 'escrow_release', -v_amount, 'Dispute escrow settled', v_order_id),
    (v_admin_id, 'platform_fee', v_team_fee, 'Commis Team 10% dispute resolution fee', v_order_id);
  if v_client_amount > 0 then
    insert into public.wallet_transactions (user_id, type, amount, description, order_id)
    values (v_client_id, 'escrow_release', v_client_amount,
      'Dispute award: ' || v_client_percent::text || '% of post-fee funds', v_order_id);
  end if;
  if v_hunter_amount > 0 then
    insert into public.wallet_transactions (user_id, type, amount, description, order_id)
    values (v_hunter_id, 'commission_payment', v_hunter_amount,
      'Dispute award: ' || v_hunter_percent::text || '% of post-fee funds', v_order_id);
  end if;

  update public.disputes
  set status = 'resolved', resolution = 'split', client_percent = v_client_percent,
    hunter_percent = v_hunter_percent, resolution_note = nullif(btrim(p_resolution_note), ''),
    team_fee_amount = v_team_fee, resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id;
  update public.orders set status = 'completed', team_fee_amount = v_team_fee, updated_at = now()
  where id = v_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (v_client_id, 'dispute_resolved_client', 'Your dispute was resolved',
      'The Commis Team received 10% (' || v_team_fee::text || '). From the remaining 90%, you receive ' || v_client_percent::text || '% (' || v_client_amount::text || ') and the Hunter receives ' || v_hunter_percent::text || '% (' || v_hunter_amount::text || ').', p_dispute_id),
    (v_hunter_id, 'dispute_resolved_hunter', 'Your commission dispute was resolved',
      'The Commis Team received 10% (' || v_team_fee::text || '). From the remaining 90%, you receive ' || v_hunter_percent::text || '% (' || v_hunter_amount::text || ') and the Client receives ' || v_client_percent::text || '% (' || v_client_amount::text || ').', p_dispute_id),
    (v_admin_id, 'dispute_platform_fee', 'Commis Team fee earned',
      'The Commis Team received its 10% service fee (' || v_team_fee::text || ') from a resolved dispute.', p_dispute_id);
end $$;

revoke all on function public.start_dispute_review(uuid) from public;
revoke all on function public.mark_dispute_decision_pending(uuid) from public;
revoke all on function public.resolve_dispute_split(uuid, numeric, text) from public;
grant execute on function public.start_dispute_review(uuid) to authenticated;
grant execute on function public.mark_dispute_decision_pending(uuid) to authenticated;
grant execute on function public.resolve_dispute_split(uuid, numeric, text) to authenticated;


create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only admin can resolve disputes';
  end if;
  if p_resolution = 'refund_client' then
    perform public.resolve_dispute_split(p_dispute_id, 100, null);
  elsif p_resolution = 'release_hunter' then
    perform public.resolve_dispute_split(p_dispute_id, 0, null);
  else
    raise exception 'Use refund_client or release_hunter';
  end if;
end $$;

revoke all on function public.resolve_dispute(uuid, text) from public;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;


-- =====================================================================
-- 12. AUTO-RELEASE CRON JOB (72-hour timer)
-- =====================================================================
-- Requires the pg_cron extension — enable under Database → Extensions first.

create extension if not exists pg_cron;

select cron.schedule(
  'auto-release-escrow',
  '0 * * * *',
  $$
  select public.release_escrow(id)
  from public.orders
  where status = 'delivered' and auto_release_at <= now();
  $$
);


-- =====================================================================
-- 13. NOTIFICATIONS, CONVERSATIONS, MESSAGES
-- =====================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz default now()
);

insert into public.notifications (user_id, type, title, body)
select
  p.id,
  'welcome',
  case when p.active_role = 'client' then 'Welcome to Commis, Client!' else 'Welcome to Commis, Hunter!' end,
  case when p.active_role = 'client' then
    'Welcome to Commis. You can post service requests, review bids from Hunters, and build your commissions from the Marketplace.'
  else
    'Welcome to Commis. You can explore the Marketplace, discover service requests, and place bids on commissions that match your skills. You can also showcase your work through Posts and your Portfolio.'
  end
from public.profiles p
where not exists (
  select 1
  from public.notifications n
  where n.user_id = p.id and n.type = 'welcome'
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table conversation_participants (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) not null,
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size bigint,
  constraint messages_body_or_attachment_check
    check (nullif(btrim(body), '') is not null or attachment_path is not null),
  constraint messages_attachment_metadata_check
    check (
      (attachment_path is null and attachment_name is null and attachment_mime_type is null and attachment_size is null)
      or (attachment_path is not null and attachment_name is not null and attachment_mime_type is not null and attachment_size between 1 and 10485760)
    )
);

alter table notifications enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to start a conversation'; end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Choose another Commis member to message';
  end if;
  perform p.id from public.profiles p
  where p.id in (v_user_id, p_other_user_id) order by p.id for update;
  if (select count(*) from public.profiles p where p.id in (v_user_id, p_other_user_id)) <> 2 then
    raise exception 'This Commis member could not be found';
  end if;
  select c.id into v_conversation_id
  from public.conversations c
  where exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.user_id = v_user_id)
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.user_id = p_other_user_id)
    and (select count(*) from public.conversation_participants cp where cp.conversation_id = c.id) = 2
  order by c.created_at limit 1;
  if v_conversation_id is null then
    insert into public.conversations default values returning id into v_conversation_id;
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);
  end if;
  return v_conversation_id;
end;
$$;
revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.validate_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attachment_path is not null and (
    split_part(new.attachment_path, '/', 1) <> new.conversation_id::text
    or split_part(new.attachment_path, '/', 2) <> new.sender_id::text
    or not exists (select 1 from storage.objects o where o.bucket_id = 'message-attachments' and o.name = new.attachment_path)
  ) then
    raise exception 'Message attachment path is invalid';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_message_attachment() from public;
create trigger validate_message_attachment_before_insert
  before insert on public.messages for each row execute function public.validate_message_attachment();

grant select on public.notifications to authenticated;
grant select on public.conversations, public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy "users view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "users mark own notifications read" on notifications for update using (auth.uid() = user_id);

create policy "participants view own conversations" on conversations for select
  using (exists(select 1 from conversation_participants cp where cp.conversation_id = id and cp.user_id = auth.uid()));
create policy "users view own participation rows" on conversation_participants for select
  using (public.is_conversation_participant(conversation_id));

create policy "participants view messages" on messages for select
  using (exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy "participants send messages" on messages for insert
  with check (auth.uid() = sender_id and exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy "recipients mark messages read" on messages for update
  using (sender_id <> auth.uid() and exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()))
  with check (sender_id <> auth.uid() and exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));


-- =====================================================================
-- 14. SAVED REQUESTS ("Marked Bounties") + USER INTERESTS
-- =====================================================================

create table saved_requests (
  user_id uuid references profiles(id) on delete cascade,
  request_id uuid references service_requests(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, request_id)
);

create table user_interests (
  user_id uuid references profiles(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  primary key (user_id, category_id)
);

alter table saved_requests enable row level security;
alter table user_interests enable row level security;

create policy "users manage own saved requests" on saved_requests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own interests" on user_interests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, delete on public.saved_requests to authenticated;


-- =====================================================================
-- 15. STORAGE BUCKETS & POLICIES
-- =====================================================================
-- Create these buckets in Dashboard → Storage first:
--   avatars            (PUBLIC)
--   post-media         (PUBLIC)
--   portfolio-media    (PUBLIC)
--   order-deliverables (PRIVATE — do not toggle "Public bucket")
--   dispute-attachments (PRIVATE — do not toggle "Public bucket")
--   message-attachments (PRIVATE — do not toggle "Public bucket")
-- Then run the policies below.

create policy "avatar images are publicly accessible"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "users upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "post media is publicly accessible"
  on storage.objects for select using (bucket_id = 'post-media');
create policy "users upload own post media"
  on storage.objects for insert
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own post media"
  on storage.objects for delete
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "portfolio media is publicly accessible"
  on storage.objects for select using (bucket_id = 'portfolio-media');
create policy "users upload own portfolio media"
  on storage.objects for insert
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "conversation participants view message attachments"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1] and cp.user_id = auth.uid()
    )
  );
create policy "conversation participants upload own message attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1] and cp.user_id = auth.uid()
    )
  );
create policy "conversation participants clean up own message attachments"
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1] and cp.user_id = auth.uid()
    )
  );

create policy "order participants can upload deliverables"
  on storage.objects for insert
  with check (
    bucket_id = 'order-deliverables'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
      and (o.client_id = auth.uid() or o.hunter_id = auth.uid())
    )
  );
create policy "order participants can view deliverables"
  on storage.objects for select
  using (
    bucket_id = 'order-deliverables'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
      and (o.client_id = auth.uid() or o.hunter_id = auth.uid() or exists(select 1 from profiles where id = auth.uid() and is_admin))
    )
  );
create policy "hunters can remove own in progress delivery files"
  on storage.objects for delete
  using (
    bucket_id = 'order-deliverables'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.hunter_id = auth.uid()
        and o.status = 'in_progress'
    )
  );
create policy "clients upload dispute evidence"
  on storage.objects for insert
  with check (
    bucket_id = 'dispute-attachments'
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and (storage.foldername(name))[2] = auth.uid()::text
        and o.status in ('in_progress', 'delivered')
    )
  );
create policy "participants view dispute evidence"
  on storage.objects for select
  using (
    bucket_id = 'dispute-attachments'
    and (
      exists (
        select 1 from orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.client_id = auth.uid() or o.hunter_id = auth.uid())
      )
      or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
    )
  );
create policy "clients clean up unfiled dispute evidence"
  on storage.objects for delete
  using (
    bucket_id = 'dispute-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and not exists (
      select 1 from dispute_attachments a where a.file_url = storage.objects.name
    )
    and exists (
      select 1 from orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and o.status in ('in_progress', 'delivered')
    )
  );

-- =====================================================================
-- END OF SCRIPT
-- =====================================================================
