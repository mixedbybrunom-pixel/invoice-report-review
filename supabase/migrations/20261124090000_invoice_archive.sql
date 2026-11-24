create table if not exists public.invoice_archive_events (
  event_key text primary key,
  invoice_no text not null,
  account_no text not null default '',
  customer_name text not null default '',
  customer_address text not null default '',
  document_id text not null default '',
  delivery_date date not null,
  driver_name text not null default '',
  vehicle text not null default '',
  weight numeric,
  quantity integer,
  details text not null default '',
  source_report_name text not null default '',
  outcome text generated always as (
    case when btrim(details) = '' then 'delivered'
         when lower(btrim(details)) = 'delivery failed' then 'failed'
         else 'other' end
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists invoice_archive_lookup_invoice_account_date
  on public.invoice_archive_events (invoice_no, account_no, delivery_date desc);
create index if not exists invoice_archive_lookup_date
  on public.invoice_archive_events (delivery_date desc);
create index if not exists invoice_archive_lookup_customer
  on public.invoice_archive_events using gin (to_tsvector('simple', customer_name));

alter table public.invoice_archive_events enable row level security;
drop policy if exists "Team members can read invoice archive" on public.invoice_archive_events;
create policy "Team members can read invoice archive" on public.invoice_archive_events
  for select to authenticated using (
    exists (select 1 from public.invoice_review_members m where m.user_id = (select auth.uid()))
  );
drop policy if exists "Team members can insert invoice archive" on public.invoice_archive_events;
create policy "Team members can insert invoice archive" on public.invoice_archive_events
  for insert to authenticated with check (
    exists (select 1 from public.invoice_review_members m where m.user_id = (select auth.uid()))
  );
drop policy if exists "Team members can update invoice archive" on public.invoice_archive_events;
create policy "Team members can update invoice archive" on public.invoice_archive_events
  for update to authenticated using (
    exists (select 1 from public.invoice_review_members m where m.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.invoice_review_members m where m.user_id = (select auth.uid()))
  );
grant select, insert, update on public.invoice_archive_events to authenticated;

create or replace function public.enforce_invoice_archive_30_day_window()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delivery_date < current_date - 29 or new.delivery_date > current_date then
    raise exception 'Invoice archive imports must be limited to the previous 30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_archive_30_day_window on public.invoice_archive_events;
create trigger invoice_archive_30_day_window
  before insert or update of delivery_date on public.invoice_archive_events
  for each row execute function public.enforce_invoice_archive_30_day_window();

