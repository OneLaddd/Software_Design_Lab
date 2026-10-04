-- Seed 1 of 2: create/update a showcase post by an existing account.
-- Replace the two username/slug values below with real rows in profiles/communities.
-- Run this before posts_showcase_seed_engagement.sql.

do $$
declare
  author_username text := 'Hunter';
  community_slug text := 'programming';
  seed_title text := 'Showcase seed: Building a small creative project';
  author_uuid uuid;
  community_uuid uuid;
  post_uuid uuid;
begin
  select id into author_uuid from public.profiles where username = author_username limit 1;
  if author_uuid is null then raise exception 'No profile found for username "%"', author_username; end if;
  select id into community_uuid from public.communities where slug = community_slug limit 1;
  if community_uuid is null then raise exception 'No community found for slug "%"', community_slug; end if;

  select id into post_uuid from public.posts
    where author_id = author_uuid and title = seed_title limit 1;
  if post_uuid is null then
    insert into public.posts(author_id, community_id, title, body)
    values (author_uuid, community_uuid, seed_title,
      'I am sharing a work in progress. I started with a simple idea, explored a few directions, and refined the details based on feedback. What would you improve next?')
    returning id into post_uuid;
  else
    update public.posts set community_id = community_uuid,
      body = 'I am sharing a work in progress. I started with a simple idea, explored a few directions, and refined the details based on feedback. What would you improve next?'
      where id = post_uuid;
  end if;
  raise notice 'Showcase post id: %', post_uuid;
end $$;
