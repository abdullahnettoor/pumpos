alter table public.collections add column metadata jsonb not null default '{}'::jsonb;
alter table public.expenses add column metadata jsonb not null default '{}'::jsonb;
alter table public.other_income add column metadata jsonb not null default '{}'::jsonb;
alter table public.customer_transactions add column metadata jsonb not null default '{}'::jsonb;
alter table public.supplier_transactions add column metadata jsonb not null default '{}'::jsonb;

-- Open-day reports are live previews. Remove provisional snapshots created
-- before persisted generation was restricted to closed Business Days.
delete from public.dssr_snapshots snapshot
using public.business_days day
where snapshot.organization_id = day.organization_id
  and snapshot.station_id = day.station_id
  and snapshot.business_date = day.business_date
  and day.status = 'OPEN';
