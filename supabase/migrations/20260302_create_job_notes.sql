-- Job notes table for Salesforce-style note tracking on job orders
create table public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references public.job_orders(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_name text not null,
  content text not null,
  note_type text not null default 'manual',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for fast lookups
create index idx_job_notes_job_order_id on public.job_notes(job_order_id);
create index idx_job_notes_created_at on public.job_notes(created_at desc);

-- RLS: only admins and super_admins can access
alter table public.job_notes enable row level security;
create policy "Admins full access" on public.job_notes for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin'))
);
