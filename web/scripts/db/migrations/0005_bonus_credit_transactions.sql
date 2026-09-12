alter table if exists transactions add column if not exists amount_paid_usd decimal(18,6);
alter table if exists transactions add column if not exists amount_credited_usd decimal(18,6);
alter table if exists transactions add column if not exists bonus_usd decimal(18,6);

update transactions
set amount_paid_usd = coalesce(amount_paid_usd, amount_usd),
    amount_credited_usd = coalesce(amount_credited_usd, amount_usd),
    bonus_usd = coalesce(bonus_usd, 0)
where amount_paid_usd is null
   or amount_credited_usd is null
   or bonus_usd is null;
