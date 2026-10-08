-- Tirla Ventures — application store
-- Run once in Supabase → SQL Editor. Create the project in the MUMBAI (ap-south-1)
-- region first; region cannot be changed afterwards.

create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- 01 / you
  name            text not null,
  email           text not null,
  linkedin        text not null,
  location        text not null,
  team            text not null,
  unusual         text not null,

  -- 02 / the company
  what_building   text not null,
  without_product text not null,
  link            text not null,

  -- 03 / the insight
  belief          text not null,
  why_now         text not null,
  ten_years       text not null,

  -- 04 / the signal
  evidence        text not null,
  learned_30d     text not null,

  -- 05 / the founders
  why_you         text not null,
  keep_building   text not null,
  why_fail        text not null,

  -- 06 / the round
  stage           text not null,
  raised_before   text not null,
  raising_amount  text not null,
  prove_next      text not null,

  -- one last thing
  anything_else   text not null,

  -- consent record: who agreed, when, and to which version of the notice
  consent_at      timestamptz not null,
  notice_version  text not null,

  -- your workflow
  status          text not null default 'new'
);

-- size limits, so a public key can't be used to dump megabytes into the table
alter table public.applications
  add constraint len_name     check (char_length(name)          <= 200),
  add constraint len_email    check (char_length(email)         <= 320),
  add constraint len_linkedin check (char_length(linkedin)      <= 500),
  add constraint len_location check (char_length(location)      <= 200),
  add constraint len_link     check (char_length(link)          <= 1000),
  add constraint len_stage    check (char_length(stage)         <= 40),
  add constraint len_raised   check (char_length(raised_before) <= 10),
  add constraint len_amount   check (char_length(raising_amount)<= 200),
  add constraint len_long     check (
       char_length(team)            <= 4000
   and char_length(unusual)         <= 8000
   and char_length(what_building)   <= 2000
   and char_length(without_product) <= 8000
   and char_length(belief)          <= 8000
   and char_length(why_now)         <= 8000
   and char_length(ten_years)       <= 8000
   and char_length(evidence)        <= 8000
   and char_length(learned_30d)     <= 8000
   and char_length(why_you)         <= 8000
   and char_length(keep_building)   <= 8000
   and char_length(why_fail)        <= 8000
   and char_length(prove_next)      <= 8000
   and char_length(anything_else)   <= 8000
  );

create index if not exists applications_created_at_idx
  on public.applications (created_at desc);

-- Row Level Security: the public key may INSERT and nothing else.
-- With no select/update/delete policy, that key cannot read a single row back.
alter table public.applications enable row level security;

drop policy if exists "public can apply" on public.applications;
create policy "public can apply"
  on public.applications
  for insert
  to anon
  with check (true);

-- You read submissions in the dashboard Table Editor, which uses the service
-- role and bypasses RLS. Never put the service role key in a web page.


-- ---------------------------------------------------------------------------
-- RETENTION: makes the privacy policy's 24-month promise self-enforcing.
-- Run after enabling the pg_cron extension (Database → Extensions → pg_cron).
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'purge-old-applications',
--   '0 3 1 * *',                      -- 03:00 on the 1st of each month
--   $$ delete from public.applications
--      where status in ('new','passed')
--        and created_at < now() - interval '24 months' $$
-- );
