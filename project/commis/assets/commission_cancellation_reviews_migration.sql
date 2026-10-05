-- Apply after dispute_attachments_migration.sql and commission_platform_fee_migration.sql.
-- Cancellation is permitted only before escrow is locked. Reviews are mutual,
-- Both participants may review completed commissions. After cancellation,
-- only the Hunter may review the Client.

alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id);

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('created', 'escrow_locked', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled'));

alter table public.bids drop constraint if exists bids_status_check;
alter table public.bids add constraint bids_status_check
  check (status in ('pending', 'accepted', 'rejected', 'cancelled'));

alter table public.reviews drop constraint if exists reviews_order_id_key;
alter table public.reviews drop constraint if exists reviews_order_id_reviewer_id_key;
alter table public.reviews drop constraint if exists reviews_order_reviewer_key;
alter table public.reviews
  add constraint reviews_order_reviewer_key unique (order_id, reviewer_id);
alter table public.reviews drop constraint if exists reviews_comment_length_check;
alter table public.reviews
  add constraint reviews_comment_length_check check (comment is null or length(comment) <= 1000);

grant select on public.reviews to authenticated;
revoke insert on public.reviews from authenticated;

-- Once escrow is locked, a client can only raise the issue as a dispute.
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
  if auth.uid() is null then raise exception 'You must be signed in to file a dispute'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Choose a reason for the dispute'; end if;
  if nullif(btrim(p_explanation), '') is null or length(p_explanation) > 1000 then
    raise exception 'Enter an explanation of 1 to 1000 characters';
  end if;
  if jsonb_typeof(v_attachments) is distinct from 'array' then raise exception 'Evidence attachments must be a list'; end if;
  if jsonb_array_length(v_attachments) > 5 then raise exception 'You can attach up to 5 evidence files'; end if;
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
  ) then raise exception 'Evidence file path is invalid'; end if;

  update public.orders set status = 'disputed', updated_at = now()
  where id = p_order_id and client_id = auth.uid()
    and status in ('escrow_locked', 'in_progress', 'delivered');
  if not found then raise exception 'Only the client can dispute an escrow locked or active commission'; end if;

  insert into public.disputes (order_id, filed_by, reason, explanation)
  values (p_order_id, auth.uid(), p_reason, btrim(p_explanation))
  returning id into v_dispute_id;

  insert into public.dispute_attachments (dispute_id, file_url, file_name)
  select v_dispute_id, item.value ->> 'file_url', item.value ->> 'file_name'
  from jsonb_array_elements(v_attachments) as item(value);

  insert into public.notifications (user_id, type, title, body, related_id)
  select recipient.user_id, recipient.type, recipient.title, recipient.body, v_dispute_id
  from (
    select o.client_id as user_id, 'dispute_filed_client'::text as type,
      'Your dispute was submitted'::text as title,
      'Your dispute for ' || coalesce(sr.title, 'this commission') || ' was submitted. View the case and its evidence.' as body
    from public.orders o left join public.service_requests sr on sr.id = o.request_id where o.id = p_order_id
    union all
    select o.hunter_id, 'dispute_filed_hunter', 'A dispute was filed for your commission',
      'The client filed a dispute for ' || coalesce(sr.title, 'your commission') || '. View the case and respond.'
    from public.orders o left join public.service_requests sr on sr.id = o.request_id where o.id = p_order_id
    union all
    select p.id, 'dispute_filed_admin', 'New dispute needs review',
      'A client filed a dispute for ' || coalesce(sr.title, 'a commission') || '. Review the case.'
    from public.profiles p cross join public.orders o
    left join public.service_requests sr on sr.id = o.request_id
    where p.is_admin = true and o.id = p_order_id
  ) as recipient;
  return v_dispute_id;
end $$;

revoke all on function public.file_dispute_with_attachments(uuid, text, text, jsonb) from public;
grant execute on function public.file_dispute_with_attachments(uuid, text, text, jsonb) to authenticated;

drop policy if exists "clients upload dispute evidence" on storage.objects;
create policy "clients upload dispute evidence" on storage.objects for insert
  with check (
    bucket_id = 'dispute-attachments'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and (storage.foldername(name))[2] = auth.uid()::text
        and o.status in ('escrow_locked', 'in_progress', 'delivered')
    )
  );
drop policy if exists "participants view dispute evidence" on storage.objects;
create policy "participants view dispute evidence" on storage.objects for select
  using (
    bucket_id = 'dispute-attachments'
    and (
      exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.client_id = auth.uid() or o.hunter_id = auth.uid())
      )
      or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    )
  );
drop policy if exists "clients clean up unfiled dispute evidence" on storage.objects;
create policy "clients clean up unfiled dispute evidence" on storage.objects for delete
  using (
    bucket_id = 'dispute-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and not exists (select 1 from public.dispute_attachments a where a.file_url = storage.objects.name)
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and o.status in ('escrow_locked', 'in_progress', 'delivered')
    )
  );

drop policy if exists "order participants leave reviews" on public.reviews;
drop policy if exists "participants read reviews for their orders" on public.reviews;
create policy "participants read reviews for their orders" on public.reviews for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and (o.client_id = auth.uid() or o.hunter_id = auth.uid())
    )
  );

create or replace function public.cancel_created_commission(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_request_id uuid;
  v_bid_id uuid;
  v_client_id uuid;
  v_hunter_id uuid;
  v_title text;
begin
  if auth.uid() is null then raise exception 'You must be signed in to cancel a commission'; end if;

  select request_id, bid_id, client_id, hunter_id
  into v_request_id, v_bid_id, v_client_id, v_hunter_id
  from public.orders
  where id = p_order_id and status = 'created'
  for update;
  if not found then raise exception 'Only a commission awaiting escrow can be cancelled'; end if;
  if v_client_id <> auth.uid() then raise exception 'Only the client can cancel this commission'; end if;

  select title into v_title from public.service_requests where id = v_request_id;
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), updated_at = now()
  where id = p_order_id and status = 'created';
  if not found then raise exception 'This commission has already changed state'; end if;

  update public.bids set status = 'cancelled'
  where id = v_bid_id and status = 'accepted';
  update public.service_requests set status = 'open'
  where id = v_request_id and client_id = auth.uid() and status = 'awarded';

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (v_client_id, 'commission_cancelled_client', 'Commission cancelled',
      'You cancelled ' || coalesce(v_title, 'the commission') || ' before escrow was locked. The request is open for new bids.', p_order_id),
    (v_hunter_id, 'commission_cancelled_hunter', 'Commission cancelled by the client',
      'The client cancelled ' || coalesce(v_title, 'the commission') || ' before escrow was locked. No escrow funds were moved.', p_order_id);
end $$;

revoke all on function public.cancel_created_commission(uuid) from public;
grant execute on function public.cancel_created_commission(uuid) to authenticated;

create or replace function public.lock_escrow(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_client_id uuid;
  v_amount numeric;
  v_admin_id uuid;
  v_balance numeric;
begin
  select client_id, amount into v_client_id, v_amount
  from public.orders where id = p_order_id and status = 'created' for update;
  if not found then raise exception 'This commission is no longer awaiting escrow'; end if;
  if v_client_id <> auth.uid() then raise exception 'Only the client can lock escrow for this order'; end if;

  select available_balance into v_balance from public.wallets where user_id = v_client_id;
  if v_balance is null or v_balance < v_amount then raise exception 'Insufficient funds'; end if;
  select id into v_admin_id from public.profiles where is_admin = true order by created_at limit 1;
  if v_admin_id is null then raise exception 'The Commis Team escrow account was not found'; end if;

  update public.wallets set available_balance = available_balance - v_amount, updated_at = now()
  where user_id = v_client_id and available_balance >= v_amount;
  if not found then raise exception 'Insufficient funds'; end if;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_client_id, 'escrow_lock', -v_amount, 'Escrow locked for order', p_order_id);

  update public.wallets set escrow_balance = escrow_balance + v_amount, updated_at = now()
  where user_id = v_admin_id;
  if not found then raise exception 'The Commis Team escrow wallet was not found'; end if;
  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values (v_admin_id, 'escrow_lock', v_amount, 'Holding escrow for order', p_order_id);

  update public.orders set status = 'escrow_locked', updated_at = now()
  where id = p_order_id and status = 'created';
  if not found then raise exception 'This commission has already changed state'; end if;
end $$;

revoke all on function public.lock_escrow(uuid) from public;
grant execute on function public.lock_escrow(uuid) to authenticated;

create or replace function public.submit_order_review(
  p_order_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
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

  select client_id, hunter_id, status into v_client_id, v_hunter_id, v_status
  from public.orders where id = p_order_id;
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
end $$;

revoke all on function public.submit_order_review(uuid, smallint, text) from public;
grant execute on function public.submit_order_review(uuid, smallint, text) to authenticated;

-- Completed commissions invite both participants; cancelled commissions invite
-- only the Hunter, who may review the Client.
create or replace function public.notify_order_reviews_after_outcome()
returns trigger
language plpgsql
security definer set search_path = ''
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
end $$;

drop trigger if exists order_outcome_review_notifications on public.orders;
create trigger order_outcome_review_notifications
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status and new.status in ('completed', 'cancelled'))
  execute function public.notify_order_reviews_after_outcome();
