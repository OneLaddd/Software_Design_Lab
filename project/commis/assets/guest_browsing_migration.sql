-- Allow signed-out visitors to browse public Commis content.
-- This migration grants SELECT only on public-facing data. It does not grant
-- anonymous access to memberships, bids, saved requests, messages, or funds.
-- Run after commis_master_schema.sql and posts_showcase_migration.sql.

grant select (id, username, avatar_url, bio, active_role, created_at,
             hunter_rating, hunter_rating_count, client_rating, client_rating_count)
  on public.profiles to anon;

grant select on public.categories to anon;
grant select on public.communities to anon;
-- Permit public member totals on community pages without exposing member IDs.
grant select (community_id) on public.community_members to anon;

grant select (id, client_id, title, description, budget_min, budget_max, currency, status, created_at)
  on public.service_requests to anon;
grant select (request_id, category_id)
  on public.request_categories to anon;

grant select on public.posts to anon;
grant select (post_id, user_id, value)
  on public.votes to anon;
grant select (id, post_id, author_id, parent_comment_id, body, created_at, deleted_at)
  on public.comments to anon;
grant select (id, post_id, media_url, position, created_at)
  on public.post_media to anon;

grant select (id, user_id, title, subtitle, category_id, image_url, description, skills, project_url, created_at)
  on public.portfolio_entries to anon;
grant select (id, reviewer_id, reviewee_id, reviewed_role, rating, comment, created_at)
  on public.reviews to anon;

-- This RPC returns only the completed public commission summaries shown on
-- profiles. Keep orders private and expose no order amounts or participant IDs.
create or replace function public.get_public_profile_commissions(p_profile_id uuid)
returns table (id uuid, request_id uuid, title text, role text, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
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
grant execute on function public.get_public_profile_commissions(uuid) to authenticated, anon;
