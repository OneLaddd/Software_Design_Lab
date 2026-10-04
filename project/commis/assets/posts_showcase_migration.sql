-- Permissions and schema required by the Posts, Community Detail, and composer screens.
-- Safe to rerun. The post-media bucket must already exist and be public.

alter table public.communities add column if not exists banner_url text;
alter table public.posts add column if not exists view_count bigint not null default 0;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  media_url text not null,
  position int not null default 0,
  created_at timestamptz default now()
);

-- Some project databases were initialized before the Showcase tables were added.
-- Create votes/comments here so the grants below also work on those databases.
create table if not exists public.votes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  author_id uuid references public.profiles(id) not null,
  parent_comment_id uuid references public.comments(id),
  body text not null,
  created_at timestamptz default now()
);
alter table public.comments add column if not exists deleted_at timestamptz;

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

alter table public.votes enable row level security;
drop policy if exists "votes are public" on public.votes;
create policy "votes are public" on public.votes
  for select using (true);
drop policy if exists "users manage own votes" on public.votes;
create policy "users manage own votes" on public.votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.comments enable row level security;
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments
  for select using (true);
drop policy if exists "users create own comments" on public.comments;
create policy "users create own comments" on public.comments
  for insert with check (auth.uid() = author_id);
drop policy if exists "users update own comments" on public.comments;
create policy "users update own comments" on public.comments
  for update using (auth.uid() = author_id and deleted_at is null)
  with check (auth.uid() = author_id and deleted_at is null);
drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments
  for delete using (auth.uid() = author_id);

alter table public.post_media enable row level security;
drop policy if exists "post media is public" on public.post_media;
create policy "post media is public" on public.post_media
  for select using (true);
drop policy if exists "authors manage own post media" on public.post_media;
create policy "authors manage own post media" on public.post_media
  for all using (exists(select 1 from public.posts where id = post_id and author_id = auth.uid()))
  with check (exists(select 1 from public.posts where id = post_id and author_id = auth.uid()));

grant select on public.communities to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.votes to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, update, delete on public.post_media to authenticated;

-- Keep deleted comments as tombstones so their replies remain in the thread.
create or replace function public.remove_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to delete a comment';
  end if;

  update public.comments
    set body = 'Comment removed by user', deleted_at = now()
    where id = p_comment_id and author_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Comment not found or current user is not its author';
  end if;
end;
$$;
revoke all on function public.remove_comment(uuid) from public;
grant execute on function public.remove_comment(uuid) to authenticated;
-- Prevent client-side hard deletes; comment removal must preserve thread context.
revoke delete on public.comments from authenticated;
-- Disable the earlier hard-delete RPC if it was already installed.
do $$
begin
  if to_regprocedure('public.delete_comment_preserve_replies(uuid)') is not null then
    execute 'revoke all on function public.delete_comment_preserve_replies(uuid) from public, authenticated';
  end if;
end;
$$;

-- The composer RPC runs with the caller's permissions, so authors need
-- explicit RLS policies in addition to table grants to create and edit posts.
alter table public.posts enable row level security;
drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts
  for select using (true);
drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts
  for insert with check (auth.uid() = author_id);
drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts
  for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts" on public.posts
  for delete using (auth.uid() = author_id);

-- Keep posts.media_url and the ordered post_media gallery in one DB transaction.
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
declare
  saved_post_id uuid;
begin
  if char_length(btrim(coalesce(p_title, ''))) < 5 or char_length(btrim(p_title)) > 300 then
    raise exception 'Post title must be between 5 and 300 characters';
  end if;
  if coalesce(cardinality(p_media_urls), 0) > 4 then
    raise exception 'A post can contain at most four images';
  end if;

  if p_post_id is null then
    insert into public.posts(author_id, community_id, title, body, media_url)
      values (auth.uid(), p_community_id, btrim(p_title), nullif(btrim(p_body), ''), p_media_urls[1])
      returning id into saved_post_id;
  else
    update public.posts
      set community_id = p_community_id, title = btrim(p_title), body = nullif(btrim(p_body), ''), media_url = p_media_urls[1]
      where id = p_post_id and author_id = auth.uid()
      returning id into saved_post_id;
    if saved_post_id is null then raise exception 'Post not found or current user is not its author'; end if;
    delete from public.post_media where post_id = saved_post_id;
  end if;

  insert into public.post_media(post_id, media_url, position)
    select saved_post_id, media_url, ordinality - 1
      from unnest(coalesce(p_media_urls, array[]::text[])) with ordinality as items(media_url, ordinality);
  return saved_post_id;
end;
$$;
revoke all on function public.save_post_with_media(uuid, uuid, text, text, text[]) from public;
grant execute on function public.save_post_with_media(uuid, uuid, text, text, text[]) to authenticated;

drop policy if exists "users delete own post media" on storage.objects;
create policy "users delete own post media" on storage.objects
  for delete using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
