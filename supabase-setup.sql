-- Tirla Ventures — applications table
--
-- This file documents the table that is LIVE in Supabase, so the form and the
-- database stay in step. The table already exists; you do not need to run the
-- CREATE below unless you are rebuilding from scratch in a new project.
--
-- What you DO still need to run is the HARDENING block at the bottom.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),

  -- 01 / YOU
  founder_name           text not null,
  founder_email          text not null,
  founder_linkedin       text,
  founder_location       text,
  cofounders             text,
  unusual_founder_story  text,

  -- 02 / THE COMPANY
  company_name           text not null,
  company_website        text not null,
  what_are_you_building  text not null,
  current_alternative    text,
  product_link           text,

  -- 03 / THE INSIGHT
  non_obvious_belief     text,
  why_now                text,
  ten_year_vision        text,

  -- 04 / THE SIGNAL
  strongest_evidence     text,
  recent_learning        text,

  -- 05 / THE FOUNDERS
  why_you                text,
  build_without_funding  text,
  biggest_failure_risk   text,

  -- 06 / THE ROUND
  stage                  text,
  raised_before          boolean,
  amount_raising         text,
  round_goal             text,

  -- ONE LAST THING
  anything_else          text,

  -- CONSENT
  consent_given          boolean not null default false,
  consent_given_at       timestamptz,

  -- SYSTEM
  status                 text not null default 'new',
  submitted_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);


-- ===========================================================================
-- HARDENING — run this block once. All of it is safe to re-run.
-- ===========================================================================

-- 1. Which version of the privacy notice the founder agreed to. Without this
--    you can show WHEN someone consented but not WHAT they consented to.
--    The form sends it if the column exists and omits it if it doesn't, so
--    adding this never breaks anything.
alter table public.applications
  add column if not exists notice_version text;

-- 2. Row Level Security. THIS IS THE IMPORTANT ONE.
--    The key in supabase-config.js is public — it is in the page source and on
--    GitHub. RLS is the only thing stopping anyone from reading every
--    application you have ever received. With the policy below that key can
--    INSERT and nothing else: no select, no update, no delete.
--    You read applications in the dashboard, which bypasses RLS.
alter table public.applications enable row level security;

drop policy if exists "public can apply" on public.applications;
create policy "public can apply"
  on public.applications
  for insert
  to anon
  with check (true);

-- 3. Size limits, so nobody can use the public key to push megabytes into the
--    table. These match the maxlength attributes on the form.
alter table public.applications
  drop constraint if exists applications_length_limits;
alter table public.applications
  add constraint applications_length_limits check (
       char_length(founder_name)          <= 120
   and char_length(founder_email)         <= 320
   and char_length(founder_linkedin)      <= 300
   and char_length(founder_location)      <= 120
   and char_length(company_name)          <= 200
   and char_length(company_website)       <= 300
   and char_length(what_are_you_building) <= 300
   and char_length(amount_raising)        <= 120
   and char_length(cofounders)            <= 4000
   and char_length(coalesce(unusual_founder_story,'')) <= 8000
   and char_length(coalesce(current_alternative,''))   <= 8000
   and char_length(coalesce(product_link,''))          <= 500
   and char_length(coalesce(non_obvious_belief,''))    <= 8000
   and char_length(coalesce(why_now,''))               <= 8000
   and char_length(coalesce(ten_year_vision,''))       <= 8000
   and char_length(coalesce(strongest_evidence,''))    <= 8000
   and char_length(coalesce(recent_learning,''))       <= 8000
   and char_length(coalesce(why_you,''))               <= 8000
   and char_length(coalesce(build_without_funding,'')) <= 8000
   and char_length(coalesce(biggest_failure_risk,''))  <= 8000
   and char_length(coalesce(round_goal,''))            <= 8000
   and char_length(coalesce(anything_else,''))         <= 8000
   and char_length(coalesce(deck_file_name,''))        <= 255
   and char_length(coalesce(deck_path,''))             <= 400
  );

create index if not exists applications_submitted_at_idx
  on public.applications (submitted_at desc);




-- ===========================================================================
-- PITCH DECKS — optional file upload on the application form.
-- Everything below is safe to re-run.
-- ===========================================================================

-- 4. Where the deck lives. The file itself is NOT in this table: only the
--    path to it inside the private pitch-decks bucket.
alter table public.applications
  add column if not exists deck_path       text,
  add column if not exists deck_file_name  text,
  add column if not exists deck_size_bytes bigint;

alter table public.applications
  drop constraint if exists applications_deck_size_sane;
alter table public.applications
  add constraint applications_deck_size_sane check (
    deck_size_bytes is null
    or (deck_size_bytes > 0 and deck_size_bytes <= 26214400)   -- 25 MB
  );


-- 5. The private bucket.
--    public = false is the whole point: with it false, a bucket URL returns
--    "Bucket not found" to the world, and the only way in is a signed URL
--    minted server-side with the service role key.
--
--    application/octet-stream has to be on this list because browsers very
--    often report Keynote files that way. A flat MIME list can't say
--    "octet-stream only when the extension is .key", so that rule is enforced
--    in the create-deck-upload-url function instead, which sees the filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-decks',
  'pitch-decks',
  false,
  26214400,                                                   -- 25 MB
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/x-iwork-keynote-sffkey',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 6. Storage security: deliberately NO policy for anon.
--    There is nothing to grant. The publishable key in supabase-config.js
--    cannot list, read, write or delete in this bucket, because no policy
--    gives it permission to. Uploads work only through the signed URL that
--    create-deck-upload-url issues with the service role key, and the service
--    role bypasses RLS entirely. If you ever see a policy on
--    storage.objects mentioning pitch-decks and anon, something has widened
--    access and should be removed.
--
--    This drop is here only to clean up a policy from an earlier attempt.
drop policy if exists "anon can upload a deck" on storage.objects;


-- 7. Rate limiting for create-deck-upload-url: 5 upload URLs per IP per hour.
--    The address is stored as a salted SHA-256 hash, never in the clear —
--    it exists to count requests, so there is no reason to keep the IP itself.
--    The function prunes rows older than two hours as it goes.
create table if not exists public.deck_upload_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index if not exists deck_upload_attempts_lookup_idx
  on public.deck_upload_attempts (ip_hash, created_at desc);

-- RLS on with no policies at all: anon gets nothing, the edge function's
-- service role key bypasses this.
alter table public.deck_upload_attempts enable row level security;


-- ===========================================================================
-- RETENTION — keeps the privacy notice's 24-month promise true.
--
-- READ THIS BIT: deleting a row from storage.objects in SQL removes only
-- Supabase's record of the file. The bytes stay in the underlying store and
-- keep counting against your 1 GB. Files must be deleted through the Storage
-- API to actually go away. So the purge below queues the paths, and you clear
-- the queue either by hand in the dashboard (step 1) or automatically (step 2).
-- ===========================================================================

create table if not exists public.deck_deletion_queue (
  deck_path  text primary key,
  queued_at  timestamptz not null default now(),
  reason     text
);

-- Collect decks whose application has aged out, delete the rows, and leave
-- the paths in the queue. Enable pg_cron first: Database -> Extensions.
create or replace function public.purge_old_applications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deck_deletion_queue (deck_path, reason)
  select deck_path, 'application purged at 24 months'
    from public.applications
   where status in ('new','passed')
     and submitted_at < now() - interval '24 months'
     and deck_path is not null
  on conflict (deck_path) do nothing;

  delete from public.applications
   where status in ('new','passed')
     and submitted_at < now() - interval '24 months';

  -- Decks uploaded by someone who never finished the form. Without this the
  -- public upload endpoint is a slow storage leak.
  insert into public.deck_deletion_queue (deck_path, reason)
  select o.name, 'orphan: no application row'
    from storage.objects o
   where o.bucket_id = 'pitch-decks'
     and o.created_at < now() - interval '7 days'
     and not exists (
       select 1 from public.applications a where a.deck_path = o.name
     )
  on conflict (deck_path) do nothing;
end;
$$;

-- select cron.schedule(
--   'purge-old-applications',
--   '0 3 1 * *',                      -- 03:00 on the 1st of each month
--   $$ select public.purge_old_applications() $$
-- );

-- 1. CLEARING THE QUEUE BY HAND. Run this, then delete those exact paths in
--    Storage -> pitch-decks, then run the delete below.
--      select deck_path, reason, queued_at from public.deck_deletion_queue
--       order by queued_at;
--      -- once the files are gone from the dashboard:
--      delete from public.deck_deletion_queue where deck_path in ( ... );

-- 2. CLEARING THE QUEUE AUTOMATICALLY. Needs the pg_net and supabase_vault
--    extensions, and your service role key stored in Vault once:
--      select vault.create_secret('<service-role-key>', 'service_role_key');
--    Then this calls the Storage API properly, so the bytes really go:
--
--    create or replace function public.flush_deck_deletion_queue()
--    returns void language plpgsql security definer set search_path = public as $$
--    declare k text; r record;
--    begin
--      select decrypted_secret into k from vault.decrypted_secrets
--       where name = 'service_role_key';
--      for r in select deck_path from public.deck_deletion_queue limit 100 loop
--        perform net.http_delete(
--          url     := current_setting('app.settings.supabase_url', true)
--                     || '/storage/v1/object/pitch-decks/' || r.deck_path,
--          headers := jsonb_build_object('Authorization','Bearer '||k)
--        );
--        delete from public.deck_deletion_queue where deck_path = r.deck_path;
--      end loop;
--    end; $$;
