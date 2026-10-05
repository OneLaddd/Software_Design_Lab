-- Both participants may review completed commissions. After cancellation,
-- only the Hunter may review the Client.
-- Run after commission_cancellation_reviews_migration.sql.

create or replace function public.submit_order_review(
  p_order_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_hunter_id uuid;
  v_status text;
  v_reviewee_id uuid;
  v_reviewed_role text;
  v_review_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in to leave a review'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5 stars'; end if;
  if p_comment is not null and length(btrim(p_comment)) > 1000 then
    raise exception 'Review text must be 1000 characters or fewer';
  end if;

  select client_id, hunter_id, status
  into v_client_id, v_hunter_id, v_status
  from public.orders
  where id = p_order_id;
  if not found or not (
    v_status = 'completed'
    or (v_status = 'cancelled' and auth.uid() = v_hunter_id)
  ) then
    raise exception 'Clients can review only completed commissions; Hunters may also review a cancelled commission';
  end if;

  if auth.uid() = v_client_id then
    v_reviewee_id := v_hunter_id;
    v_reviewed_role := 'hunter';
  elsif auth.uid() = v_hunter_id then
    v_reviewee_id := v_client_id;
    v_reviewed_role := 'client';
  else
    raise exception 'Only commission participants can leave a review';
  end if;

  insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewed_role, rating, comment)
  values (p_order_id, auth.uid(), v_reviewee_id, v_reviewed_role, p_rating, nullif(btrim(p_comment), ''))
  returning id into v_review_id;
  return v_review_id;
end;
$$;

revoke all on function public.submit_order_review(uuid, smallint, text) from public;
grant execute on function public.submit_order_review(uuid, smallint, text) to authenticated;
revoke insert on public.reviews from authenticated;

drop policy if exists "order participants leave reviews" on public.reviews;
create policy "order participants leave reviews" on public.reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.orders o
      where o.id = order_id
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

-- Remove the Client's invalid prompt but retain the Hunter's valid invitation.
delete from public.notifications n
using public.orders o
where n.type = 'review_requested'
  and n.related_id = o.id
  and o.status = 'cancelled'
  and n.user_id = o.client_id;

-- If an earlier migration removed the Hunter's cancellation invitation, add
-- it back once unless the Hunter has already reviewed this Client.
insert into public.notifications (user_id, type, title, body, related_id)
select o.hunter_id, 'review_requested', 'Rate your Client',
  'The commission was cancelled before escrow was locked. You may share a rating and optional review of the Client.',
  o.id
from public.orders o
where o.status = 'cancelled'
  and not exists (
    select 1 from public.reviews r
    where r.order_id = o.id and r.reviewer_id = o.hunter_id
  )
  and not exists (
    select 1 from public.notifications n
    where n.user_id = o.hunter_id
      and n.type = 'review_requested'
      and n.related_id = o.id
  );

create or replace function public.notify_order_reviews_after_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    insert into public.notifications (user_id, type, title, body, related_id)
    values
      (new.client_id, 'review_requested', 'Rate your Hunter',
        'Share a star rating and optional written review of your experience with this Hunter.', new.id),
      (new.hunter_id, 'review_requested', 'Rate your Client',
        'Share a star rating and optional written review of your experience with this Client.', new.id);
  elsif new.status = 'cancelled' then
    insert into public.notifications (user_id, type, title, body, related_id)
    values (new.hunter_id, 'review_requested', 'Rate your Client',
      'The commission was cancelled before escrow was locked. You may share a rating and optional review of the Client.', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists order_outcome_review_notifications on public.orders;
create trigger order_outcome_review_notifications
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status and new.status in ('completed', 'cancelled'))
  execute function public.notify_order_reviews_after_outcome();
