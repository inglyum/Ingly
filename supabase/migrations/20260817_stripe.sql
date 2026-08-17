-- INGLY OS — colonne Stripe per la gestione abbonamenti su ingly_users.
-- Esegui una volta nel SQL Editor di Supabase (progetto Ingly 91).
alter table public.ingly_users add column if not exists stripe_customer_id     text;
alter table public.ingly_users add column if not exists stripe_subscription_id text;

-- Indici per il lookup rapido dal webhook.
create index if not exists idx_ingly_users_stripe_customer on public.ingly_users (stripe_customer_id);
create index if not exists idx_ingly_users_username        on public.ingly_users (username);
