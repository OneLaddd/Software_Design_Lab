-- Run after creating the private `dispute-attachments` Storage bucket.
-- Evidence objects are uploaded first, then this RPC creates the dispute and
-- its attachment rows in one database transaction.
alter table public.disputes
  add column if not exists review_started_at timestamptz,
  add column if not exists decision_ready_at timestamptz,
  add column if not exists client_percent numeric,
  add column if not exists hunter_percent numeric,
  add column if not exists team_fee_amount numeric,
  add column if not exists resolution_note text,
  add column if not exists resolved_by uuid references public.profiles(id);

alter table public.disputes drop constraint if exists disputes_status_check;
alter table public.disputes add constraint disputes_status_check
  check (status in ('submitted', 'under_review', 'resolution_pending', 'resolved'));
alter table public.disputes drop constraint if exists disputes_resolution_check;
alter table public.disputes add constraint disputes_resolution_check
  check (resolution in ('refund_client', 'release_hunter', 'split'));
alter table public.disputes drop constraint if exists disputes_split_percentages_check;
alter table public.disputes add constraint disputes_split_percentages_check
  check (
    (client_percent is null and hunter_percent is null)
    or (
      client_percent between 0 and 100
      and hunter_percent between 0 and 100
      and client_percent + hunter_percent = 100
    )
  );

-- RLS policies limit rows, while SQL grants allow the app to issue these reads.
grant select on public.disputes, public.dispute_attachments to authenticated;

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
    and status in ('escrow_locked', 'in_progress', 'delivered');
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
  v_client_percent := p_client_percent;
  v_hunter_percent := 100 - v_client_percent;
  v_client_amount := round(v_amount * v_client_percent / 100, 2);
  v_hunter_amount := v_amount - v_client_amount;

  update public.wallets
  set escrow_balance = escrow_balance - v_amount, updated_at = now()
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
  values (v_admin_id, 'escrow_release', -v_amount, 'Dispute escrow split', v_order_id);
  if v_client_amount > 0 then
    insert into public.wallet_transactions (user_id, type, amount, description, order_id)
    values (v_client_id, 'escrow_release', v_client_amount,
      'Dispute resolved: ' || v_client_percent::text || '% refund', v_order_id);
  end if;
  if v_hunter_amount > 0 then
    insert into public.wallet_transactions (user_id, type, amount, description, order_id)
    values (v_hunter_id, 'commission_payment', v_hunter_amount,
      'Dispute resolved: ' || v_hunter_percent::text || '% commission payment', v_order_id);
  end if;

  update public.disputes
  set status = 'resolved', resolution = 'split', client_percent = v_client_percent,
    hunter_percent = v_hunter_percent, resolution_note = nullif(btrim(p_resolution_note), ''),
    resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id;
  update public.orders set status = 'completed', updated_at = now() where id = v_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (v_client_id, 'dispute_resolved_client', 'Your dispute was resolved',
      'Resolution: you receive ' || v_client_percent::text || '% (' || v_client_amount::text || '), and the hunter receives ' || v_hunter_percent::text || '% (' || v_hunter_amount::text || ').', p_dispute_id),
    (v_hunter_id, 'dispute_resolved_hunter', 'Your commission dispute was resolved',
      'Resolution: you receive ' || v_hunter_percent::text || '% (' || v_hunter_amount::text || '), and the client receives ' || v_client_percent::text || '% (' || v_client_amount::text || ').', p_dispute_id);
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

drop policy if exists "clients upload dispute evidence" on storage.objects;
create policy "clients upload dispute evidence"
  on storage.objects for insert
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
create policy "participants view dispute evidence"
  on storage.objects for select
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
create policy "clients clean up unfiled dispute evidence"
  on storage.objects for delete
  using (
    bucket_id = 'dispute-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and not exists (
      select 1 from public.dispute_attachments a where a.file_url = storage.objects.name
    )
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and o.status in ('escrow_locked', 'in_progress', 'delivered')
    )
  );
