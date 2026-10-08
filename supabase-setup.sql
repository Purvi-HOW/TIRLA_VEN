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
  );

create index if not exists applications_submitted_at_idx
  on public.applications (submitted_at desc);


-- ===========================================================================
-- RETENTION — makes the privacy policy's 24-month promise self-enforcing.
-- Enable pg_cron first (Database -> Extensions -> pg_cron), then uncomment.
-- ===========================================================================
-- select cron.schedule(
--   'purge-old-applications',
--   '0 3 1 * *',                      -- 03:00 on the 1st of each month
--   $$ delete from public.applications
--      where status in ('new','passed')
--        and submitted_at < now() - interval '24 months' $$
-- );
