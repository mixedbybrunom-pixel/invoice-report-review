create or replace function public.enforce_invoice_archive_30_day_window()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if new.delivery_date >= local_today then
    raise exception 'Invoice archive imports cannot include today or future delivery dates';
  end if;
  return new;
end;
$$;

