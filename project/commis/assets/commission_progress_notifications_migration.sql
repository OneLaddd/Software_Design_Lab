-- Notify both commission participants when escrow is locked, work starts,
-- or the Hunter submits delivery. Existing RPCs already notify participants
-- for acceptance, disputes, completion, and cancellation.
-- Run after commis_master_schema.sql and commission_cancellation_reviews_migration.sql.

create or replace function public.notify_commission_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_suffix text;
  event_title text;
  event_body text;
  request_title text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select sr.title into request_title
  from public.service_requests sr
  where sr.id = new.request_id;

  case new.status
    when 'escrow_locked' then
      event_suffix := 'escrow_locked';
      event_title := 'Escrow is locked';
      event_body := 'Escrow for ' || coalesce(request_title, 'this commission') || ' is secured. The Hunter can start work.';
    when 'in_progress' then
      event_suffix := 'in_progress';
      event_title := 'Commission work started';
      event_body := 'Work has started on ' || coalesce(request_title, 'this commission') || '.';
    when 'delivered' then
      event_suffix := 'delivered';
      event_title := 'Delivery submitted';
      event_body := 'The Hunter submitted the work for ' || coalesce(request_title, 'this commission') || '. Review the delivery in the commission detail.';
    else
      return new;
  end case;

  insert into public.notifications (user_id, type, title, body, related_id)
  values
    (new.client_id, 'commission_progress_' || event_suffix || '_client', event_title, event_body, new.id),
    (new.hunter_id, 'commission_progress_' || event_suffix || '_hunter', event_title, event_body, new.id);

  return new;
end;
$$;

revoke all on function public.notify_commission_progress() from public, anon, authenticated;

drop trigger if exists commission_progress_notifications on public.orders;
create trigger commission_progress_notifications
  after update of status on public.orders
  for each row
  execute function public.notify_commission_progress();
