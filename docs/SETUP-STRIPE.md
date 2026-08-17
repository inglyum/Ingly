# Attivazione abbonamenti Stripe — INGLY OS

Obiettivo: quando un cliente paga, la sua licenza in `ingly_users` si attiva/rinnova **da sola**; se non paga, si sospende. Tutto senza interventi manuali.

Il codice è già pronto. Restano **3 cose che solo tu puoi fare** (richiedono il tuo account Stripe e il tuo Supabase). Circa 20 minuti.

---

## 1) SQL — aggiungi le colonne Stripe (2 min)
Supabase → **SQL Editor** → incolla e **Run** il contenuto di `supabase/migrations/20260817_stripe.sql`.

## 2) Stripe — crea i prodotti e i Payment Link (10 min)
1. Vai su [dashboard.stripe.com](https://dashboard.stripe.com) → **Prodotti** → crea 4 prodotti ricorrenti mensili:
   - INGLY Starter — €19/mese
   - INGLY Pro — €49/mese
   - INGLY Business — €99/mese
   - INGLY Enterprise — €199/mese
2. Per ognuno, **Payment Links** → crea un link. In "Dopo il pagamento" lascia la pagina di conferma Stripe.
3. Copia i 4 URL (`https://buy.stripe.com/...`). Ti servono al passo 4.
4. Annota anche i 4 **Price ID** (`price_...`) di ogni prodotto: servono al passo 3 (mappatura piano nel webhook).

## 3) Webhook — deploy della Edge Function (5 min)
Dal tuo computer (con la [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref dhfuokioyuytbxxgoilp

# incolla i tuoi 4 Price ID in supabase/functions/stripe-webhook/index.ts (PRICE_TO_PLAN)

supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx           # lo ottieni al passo sotto
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role
supabase functions deploy stripe-webhook --no-verify-jwt
```

Poi su Stripe → **Sviluppatori → Webhooks → Aggiungi endpoint**:
- URL: `https://dhfuokioyuytbxxgoilp.functions.supabase.co/stripe-webhook`
- Eventi: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Copia il **Signing secret** (`whsec_...`) e usalo nel `secrets set` qui sopra.

## 4) Collega i Payment Link all'app (2 min)
Nell'**Admin** → sezione Cloud/Billing → incolla i 4 URL dei Payment Link (uno per piano) → **Salva**.
Da quel momento, nell'OS il pulsante **"Abbonati"** porta al pagamento giusto, con l'username agganciato (`client_reference_id`) così il webhook sa quale licenza attivare.

---

## Come verificare
1. Usa Stripe in **modalità test** (chiavi `sk_test_`, carta `4242 4242 4242 4242`).
2. Nell'OS, da un utente Starter, apri una sezione bloccata → **Abbonati a Pro** → paga.
3. In pochi secondi la riga in `ingly_users` passa a `status = active`, piano `pro`, `expires_at` = fine periodo. Al login successivo l'utente ha i moduli Pro.

## Note di sicurezza
- La **service_role key** sta SOLO nei secrets della Edge Function, mai nel file HTML.
- Il webhook verifica la firma Stripe: richieste non firmate vengono rifiutate.
- Finché non completi questi passi, il pulsante "Abbonati" ricade sulla richiesta via email (nessun blocco).
