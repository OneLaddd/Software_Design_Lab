-- Seed 2 of 2: have a second existing account upvote and reply to the seeded post.
-- Replace both usernames with real, distinct profile usernames.

do $$
declare
  post_author_username text := 'Client';
  responder_username text := 'Hunter';
  seed_title text := 'Showcase seed: Building a small creative project';
  author_uuid uuid;
  responder_uuid uuid;
  post_uuid uuid;
  reply_text text := 'This is a great start. I like the direction you took; have you considered sharing one more iteration after testing the details?';
begin
  select id into author_uuid from public.profiles where username = post_author_username limit 1;
  if author_uuid is null then raise exception 'No post author profile found for username "%"', post_author_username; end if;
  select id into responder_uuid from public.profiles where username = responder_username limit 1;
  if responder_uuid is null then raise exception 'No responder profile found for username "%"', responder_username; end if;
  if author_uuid = responder_uuid then raise exception 'The responder must be a different account from the post author'; end if;
  select id into post_uuid from public.posts where author_id = author_uuid and title = seed_title limit 1;
  if post_uuid is null then raise exception 'Run posts_showcase_seed_post.sql first'; end if;

  insert into public.votes(post_id, user_id, value) values (post_uuid, responder_uuid, 1)
    on conflict (post_id, user_id) do update set value = excluded.value;
  if not exists(select 1 from public.comments where post_id = post_uuid and author_id = responder_uuid and body = reply_text) then
    insert into public.comments(post_id, author_id, parent_comment_id, body)
      values (post_uuid, responder_uuid, null, reply_text);
  end if;
  raise notice 'Added upvote and reply for post id: %', post_uuid;
end $$;
