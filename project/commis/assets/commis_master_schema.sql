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
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table profiles enable row level security;
create policy "profiles are public" on profiles for select using (true);
create policy "users update own profile" on profiles for update using (auth.uid() = id);


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
  status text default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now()
);

alter table service_requests enable row level security;
alter table request_categories enable row level security;
alter table bids enable row level security;

create policy "requests are public" on service_requests for select using (true);
create policy "clients create own requests" on service_requests for insert with check (auth.uid() = client_id);
create policy "clients update own requests" on service_requests for update using (auth.uid() = client_id);

create policy "request categories are public" on request_categories for select using (true);
create policy "clients tag own requests" on request_categories for insert
  with check (exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));
create policy "clients untag own requests" on request_categories for delete
  using (exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));

create policy "bids visible to request owner and bidder" on bids for select
  using (auth.uid() = hunter_id or exists(select 1 from service_requests where id = request_id and client_id = auth.uid()));
create policy "hunters create own bids" on bids for insert with check (auth.uid() = hunter_id);
create policy "hunters update own pending bids" on bids for update
  using (auth.uid() = hunter_id and status = 'pending');


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

alter table posts enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;

create policy "posts are public" on posts for select using (true);
create policy "users create own posts" on posts for insert with check (auth.uid() = author_id);
create policy "users update own posts" on posts for update using (auth.uid() = author_id);
create policy "users delete own posts" on posts for delete using (auth.uid() = author_id);

create policy "votes are public" on votes for select using (true);
create policy "users manage own votes" on votes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "comments are public" on comments for select using (true);
create policy "users create own comments" on comments for insert with check (auth.uid() = author_id);
create policy "users update own comments" on comments for update using (auth.uid() = author_id);
create policy "users delete own comments" on comments for delete using (auth.uid() = author_id);


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
  created_at timestamptz default now()
);

alter table portfolio_entries enable row level security;
create policy "portfolio entries are public" on portfolio_entries for select using (true);
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
    check (status in ('created','escrow_locked','in_progress','delivered','completed','disputed')),
  delivered_at timestamptz,
  auto_release_at timestamptz,
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
create policy "participants view deliverables" on deliverables for select
  using (exists(select 1 from orders o where o.id = deliverables.order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())));
create policy "participants upload deliverables" on deliverables for insert
  with check (exists(select 1 from orders o where o.id = order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid())));
-- No direct INSERT/UPDATE policy on orders for regular users — all writes go through
-- the SECURITY DEFINER functions in Section 10, which bypass RLS by design.


-- =====================================================================
-- 8. REVIEWS (dual rating system)
-- =====================================================================

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) unique not null,
  reviewer_id uuid references profiles(id) not null,
  reviewee_id uuid references profiles(id) not null,
  reviewed_role text not null check (reviewed_role in ('client','hunter')),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

alter table reviews enable row level security;
create policy "reviews are public" on reviews for select using (true);
create policy "order participants leave reviews" on reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists(select 1 from orders o where o.id = order_id and (o.client_id = auth.uid() or o.hunter_id = auth.uid()) and o.status = 'completed')
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
  type text not null check (type in ('deposit','withdrawal','escrow_lock','escrow_release','commission_payment')),
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
begin
  select request_id, hunter_id, amount into v_request_id, v_hunter_id, v_amount
  from public.bids where id = p_bid_id and status = 'pending';
  if v_request_id is null then raise exception 'Bid not found or already resolved'; end if;

  select client_id into v_client_id from public.service_requests where id = v_request_id;
  if v_client_id != auth.uid() then raise exception 'Only the request owner can accept a bid'; end if;

  update public.bids set status = 'accepted' where id = p_bid_id;
  update public.bids set status = 'rejected' where request_id = v_request_id and id != p_bid_id and status = 'pending';
  update public.service_requests set status = 'awarded' where id = v_request_id;

  insert into public.orders (request_id, bid_id, client_id, hunter_id, amount)
  values (v_request_id, p_bid_id, v_client_id, v_hunter_id, v_amount)
  returning id into v_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values (v_hunter_id, 'bid_accepted', 'Your bid was accepted!', 'Head to your commissions to get started.', v_order_id);

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
  from public.orders where id = p_order_id and status = 'created';
  if v_client_id != auth.uid() then raise exception 'Only the client can lock escrow for this order'; end if;

  select available_balance into v_balance from public.wallets where user_id = v_client_id;
  if v_balance < v_amount then raise exception 'Insufficient funds'; end if;

  select id into v_admin_id from public.profiles where is_admin = true limit 1;

  update public.wallets set available_balance = available_balance - v_amount where user_id = v_client_id;
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
  v_hunter_id uuid; v_amount numeric; v_admin_id uuid;
begin
  select hunter_id, amount into v_hunter_id, v_amount
  from public.orders where id = p_order_id and status in ('delivered','disputed');

  select id into v_admin_id from public.profiles where is_admin = true limit 1;

  update public.wallets set escrow_balance = escrow_balance - v_amount where user_id = v_admin_id;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_admin_id, 'escrow_release', -v_amount, 'Released escrow to hunter', p_order_id);

  update public.wallets set available_balance = available_balance + v_amount where user_id = v_hunter_id;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_hunter_id, 'commission_payment', v_amount, 'Commission payment received', p_order_id);

  update public.orders set status = 'completed', updated_at = now() where id = p_order_id;
end $$;

create or replace function public.withdraw_funds(p_amount numeric)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
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
  update public.wallets set available_balance = available_balance + p_amount where user_id = auth.uid();
  insert into public.wallet_transactions (user_id, type, amount, description)
  values (auth.uid(), 'deposit', p_amount, 'Top-up deposit to balance');
end $$;


-- =====================================================================
-- 11. DISPUTES
-- =====================================================================

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) unique not null,
  filed_by uuid references profiles(id) not null,
  reason text not null,
  explanation text,
  status text not null default 'submitted' check (status in ('submitted','under_review','resolved')),
  resolution text check (resolution in ('refund_client','release_hunter')),
  created_at timestamptz default now(),
  resolved_at timestamptz
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
  select id, 'dispute_filed', 'New dispute filed', p_reason, v_dispute_id
  from public.profiles where is_admin = true;

  return v_dispute_id;
end $$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order_id uuid; v_client_id uuid; v_amount numeric; v_admin_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only admin can resolve disputes';
  end if;

  select order_id into v_order_id from public.disputes where id = p_dispute_id;
  select client_id, amount into v_client_id, v_amount from public.orders where id = v_order_id;
  select id into v_admin_id from public.profiles where is_admin = true limit 1;

  if p_resolution = 'refund_client' then
    update public.wallets set escrow_balance = escrow_balance - v_amount where user_id = v_admin_id;
    update public.wallets set available_balance = available_balance + v_amount where user_id = v_client_id;
    insert into public.wallet_transactions (user_id, type, amount, description, order_id)
    values (v_client_id, 'escrow_release', v_amount, 'Dispute resolved: refunded', v_order_id);
    update public.orders set status = 'completed', updated_at = now() where id = v_order_id;
  else
    perform public.release_escrow(v_order_id);
  end if;

  update public.disputes set status = 'resolved', resolution = p_resolution, resolved_at = now()
  where id = p_dispute_id;
end $$;


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
  read_at timestamptz
);

alter table notifications enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

create policy "users view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "users mark own notifications read" on notifications for update using (auth.uid() = user_id);

create policy "participants view own conversations" on conversations for select
  using (exists(select 1 from conversation_participants cp where cp.conversation_id = id and cp.user_id = auth.uid()));
create policy "users view own participation rows" on conversation_participants for select
  using (exists(select 1 from conversation_participants cp2 where cp2.conversation_id = conversation_id and cp2.user_id = auth.uid()));
create policy "users join conversations" on conversation_participants for insert with check (auth.uid() = user_id);

create policy "participants view messages" on messages for select
  using (exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy "participants send messages" on messages for insert
  with check (auth.uid() = sender_id and exists(select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));


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


-- =====================================================================
-- 15. STORAGE BUCKETS & POLICIES
-- =====================================================================
-- Create these buckets in Dashboard → Storage first:
--   avatars            (PUBLIC)
--   post-media         (PUBLIC)
--   portfolio-media    (PUBLIC)
--   order-deliverables (PRIVATE — do not toggle "Public bucket")
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

create policy "portfolio media is publicly accessible"
  on storage.objects for select using (bucket_id = 'portfolio-media');
create policy "users upload own portfolio media"
  on storage.objects for insert
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- =====================================================================
-- END OF SCRIPT
-- =====================================================================
