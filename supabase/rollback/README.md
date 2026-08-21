# Rollback artifacts — NON sono migrazioni "up"

Questi file **non** stanno in `supabase/migrations/` di proposito: la Supabase CLI
tratterebbe qualunque `.sql` sotto `migrations/` come una migrazione **up** da
applicare. I rollback vanno tenuti fuori dalla discovery.

- `20260101000001_foundation_slice_down.sql` — rollback della foundation slice
  (drop in ordine inverso). Da eseguire **manualmente** in staging solo se serve
  annullare la foundation. **NON** applicato automaticamente.

## Layout migrazioni (dopo Fase 6)
`supabase/migrations/` (discovery CLI, ordine lessicografico):
1. `20260101000001_foundation_slice.sql` — foundation V2 (tenancy/RBAC/audit/eventi)
2. `20260101000002_rbac_seed.sql` — schema `security` + role_perm_cache + seed ruoli
3. `20260817_stripe.sql` — **LEGACY**: aggiunge colonne Stripe a `public.ingly_users`

⚠️ ATTENZIONE (da decidere prima del push su staging V2):
`20260817_stripe.sql` dipende da `public.ingly_users`, che la foundation V2 **non**
crea (è lo schema legacy/produzione dell'attuale SaaS). Su uno staging V2 pulito
questa migrazione **fallirebbe**. Opzioni (a scelta dell'utente, non decise qui):
(a) escluderla dallo staging V2; (b) mantenerla solo per l'ambiente legacy;
(c) creare prima `ingly_users` se davvero serve. Non è stata modificata/spostata
(fuori scope, nessuna congettura).
