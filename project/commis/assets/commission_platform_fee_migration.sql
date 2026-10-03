-- Apply the 10% Commis Team service fee whenever a commission escrow settles.
-- For disputes, the admin's client percentage applies to the remaining 90% pool.

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('deposit', 'withdrawal', 'escrow_lock', 'escrow_release', 'commission_payment', 'platform_fee'));

alter table public.disputes
  add column if not exists team_fee_amount numeric;
alter table public.orders
  add column if not exists team_fee_amount numeric;

-- RLS still restricts orders to their participants and admins.
grant select on public.orders to authenticated;

create or replace function public.release_escrow(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_client_id uuid;
  v_hunter_id uuid;
  v_amount numeric;
  v_team_fee numeric;
  v_hunter_amount numeric;
  v_admin_id uuid;
  v_status text;
begin
  select client_id, hunter_id, amount, status
  into v_client_id, v_hunter_id, v_amount, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_status <> 'delivered' then
    raise exception 'Only delivered commissions can release escrow';
  end if;
  if auth.uid() is not null
    and auth.uid() <> v_client_id
    and not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  then
    raise exception 'Only the client or an admin can release this escrow';
  end if;

  select id into v_admin_id
  from public.profiles
  where is_admin = true
  order by created_at
  limit 1;
  if v_admin_id is null then raise exception 'The Commis Team escrow account was not found'; end if;

  v_team_fee := round(v_amount * 0.10, 2);
  v_hunter_amount := v_amount - v_team_fee;

  update public.wallets
  set escrow_balance = escrow_balance - v_amount,
      available_balance = available_balance + v_team_fee,
      updated_at = now()
  where user_id = v_admin_id and escrow_balance >= v_amount;
  if not found then raise exception 'The escrow wallet does not contain the full commission amount'; end if;

  update public.wallets
  set available_balance = available_balance + v_hunter_amount, updated_at = now()
  where user_id = v_hunter_id;
  if not found then raise exception 'Hunter wallet was not found'; end if;

  insert into public.wallet_transactions (user_id, type, amount, description, order_id)
  values
    (v_admin_id, 'escrow_release', -v_amount, 'Escrow settled for completed commission', p_order_id),
    (v_admin_id, 'platform_fee', v_team_fee, 'Commis Team 10% service fee', p_order_id),
    (v_hunter_id, 'commission_payment', v_hunter_amount, 'Commission payment after 10% Commis Team fee', p_order_id);

  update public.orders set status = 'completed', team_fee_amount = v_team_fee, updated_at = now()
  where id = p_order_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (v_client_id, 'commission_settled_client', 'Commission completed',
      'The commission was completed. The Commis Team received 10% (' || v_team_fee::text || '), and the Hunter received 90% (' || v_hunter_amount::text || ').', p_order_id),
    (v_hunter_id, 'commission_settled_hunter', 'Commission payment received',
      'Your payment is ' || v_hunter_amount::text || ' after the Commis Team''s 10% service fee (' || v_team_fee::text || ').', p_order_id);

  insert into public.notifications (user_id, type, title, body, related_id)
  values (v_admin_id, 'commission_platform_fee', 'Commis Team fee earned',
    'The Commis Team received its 10% service fee (' || v_team_fee::text || ') from a completed commission.', p_order_id);
end $$;

revoke all on function public.release_escrow(uuid) from public;
grant execute on function public.release_escrow(uuid) to authenticated, service_role;

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
      available_balance = available_balance + v_team_fee,
      updated_at = now()
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

revoke all on function public.resolve_dispute_split(uuid, numeric, text) from public;
grant execute on function public.resolve_dispute_split(uuid, numeric, text) to authenticated;
