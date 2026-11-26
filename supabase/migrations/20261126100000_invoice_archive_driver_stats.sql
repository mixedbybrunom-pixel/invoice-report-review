create or replace function public.invoice_archive_driver_stats()
returns table (
  driver_name text,
  delivery_records bigint,
  invoices bigint,
  delivered bigint,
  failed bigint,
  unconfirmed bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(nullif(btrim(e.driver_name), ''), 'Driver unavailable') as driver_name,
    count(*)::bigint as delivery_records,
    count(distinct (e.account_no, e.invoice_no))::bigint as invoices,
    count(*) filter (where e.outcome = 'delivered')::bigint as delivered,
    count(*) filter (where e.outcome = 'failed')::bigint as failed,
    count(*) filter (where e.outcome = 'other')::bigint as unconfirmed
  from public.invoice_archive_events as e
  group by 1
  order by count(*) desc, 1;
$$;

revoke all on function public.invoice_archive_driver_stats() from public, anon;
grant execute on function public.invoice_archive_driver_stats() to authenticated;

create or replace function public.invoice_archive_monthly_driver_stats()
returns table (
  month_start date,
  driver_name text,
  delivery_records bigint,
  invoices bigint,
  delivered bigint,
  failed bigint,
  unconfirmed bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', e.delivery_date)::date as month_start,
    coalesce(nullif(btrim(e.driver_name), ''), 'Driver unavailable') as driver_name,
    count(*)::bigint as delivery_records,
    count(distinct (e.account_no, e.invoice_no))::bigint as invoices,
    count(*) filter (where e.outcome = 'delivered')::bigint as delivered,
    count(*) filter (where e.outcome = 'failed')::bigint as failed,
    count(*) filter (where e.outcome = 'other')::bigint as unconfirmed
  from public.invoice_archive_events as e
  group by 1, 2
  order by 1 desc, count(*) filter (where e.outcome = 'delivered') desc, 2;
$$;

revoke all on function public.invoice_archive_monthly_driver_stats() from public, anon;
grant execute on function public.invoice_archive_monthly_driver_stats() to authenticated;

