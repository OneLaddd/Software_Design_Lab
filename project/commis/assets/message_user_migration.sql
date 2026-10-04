-- Direct messages use the existing conversations/messages schema.
-- Run once in Supabase SQL Editor. The migration also creates a private
-- message-attachments bucket and exposes files only to conversation members.

alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size bigint;

alter table public.messages drop constraint if exists messages_body_or_attachment_check;
alter table public.messages add constraint messages_body_or_attachment_check
  check (nullif(btrim(body), '') is not null or attachment_path is not null);
alter table public.messages drop constraint if exists messages_attachment_metadata_check;
alter table public.messages add constraint messages_attachment_metadata_check
  check (
    (attachment_path is null and attachment_name is null and attachment_mime_type is null and attachment_size is null)
    or (
      attachment_path is not null
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size between 1 and 10485760
    )
  );

-- Direct conversation membership can only be established by the RPC below.
drop policy if exists "users join conversations" on public.conversation_participants;
revoke insert, update, delete on public.conversation_participants from authenticated;
grant select on public.conversations, public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

drop policy if exists "recipients mark messages read" on public.messages;
create policy "recipients mark messages read" on public.messages for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
  );

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to start a conversation'; end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Choose another Commis member to message';
  end if;

  -- Lock both profiles in a stable order so two simultaneous requests cannot
  -- create duplicate direct conversations for the same participant pair.
  perform p.id
  from public.profiles p
  where p.id in (v_user_id, p_other_user_id)
  order by p.id
  for update;
  if (select count(*) from public.profiles p where p.id in (v_user_id, p_other_user_id)) <> 2 then
    raise exception 'This Commis member could not be found';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = p_other_user_id
    )
    and (select count(*) from public.conversation_participants cp where cp.conversation_id = c.id) = 2
  order by c.created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations default values returning id into v_conversation_id;
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);
  end if;
  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.validate_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attachment_path is not null then
    if split_part(new.attachment_path, '/', 1) <> new.conversation_id::text
      or split_part(new.attachment_path, '/', 2) <> new.sender_id::text
      or not exists (
        select 1 from storage.objects object_row
        where object_row.bucket_id = 'message-attachments'
          and object_row.name = new.attachment_path
      ) then
      raise exception 'Message attachment path is invalid';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_message_attachment() from public;
drop trigger if exists validate_message_attachment_before_insert on public.messages;
create trigger validate_message_attachment_before_insert
  before insert on public.messages
  for each row execute function public.validate_message_attachment();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "conversation participants view message attachments" on storage.objects;
create policy "conversation participants view message attachments"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "conversation participants upload own message attachments" on storage.objects;
create policy "conversation participants upload own message attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "conversation participants clean up own message attachments" on storage.objects;
create policy "conversation participants clean up own message attachments"
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.user_id = auth.uid()
    )
  );

-- Keep new messages live in open chat screens. This block is safe to rerun.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
