// ────────────────────────────────────────────────────────────────────────────
// INGLY OS — Stripe Webhook (Supabase Edge Function)
// Attiva / rinnova / sospende la licenza in `ingly_users` in base agli eventi
// Stripe. Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secrets richiesti (supabase secrets set ...):
//   STRIPE_SECRET_KEY        = sk_live_... (o sk_test_...)
//   STRIPE_WEBHOOK_SECRET    = whsec_...   (dallo Stripe Dashboard → Webhooks)
//   SUPABASE_URL             = https://dhfuokioyuytbxxgoilp.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY= (service_role key — NON la publishable)
//
// Nel Payment Link/Checkout passiamo client_reference_id = username INGLY,
// così qui sappiamo quale riga di ingly_users aggiornare.
// ────────────────────────────────────────────────────────────────────────────
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Mappa il Price Stripe → piano INGLY. Compila con i tuoi Price ID.
const PRICE_TO_PLAN: Record<string, string> = {
  // "price_xxx_starter":    "starter",
  // "price_xxx_pro":        "pro",
  // "price_xxx_business":   "business",
  // "price_xxx_enterprise": "enterprise",
};

async function findUser(opts: { username?: string | null; email?: string | null; customer?: string | null }) {
  const { username, email, customer } = opts;
  if (customer) {
    const { data } = await supabase.from("ingly_users").select("*").eq("stripe_customer_id", customer).limit(1);
    if (data && data.length) return data[0];
  }
  if (username) {
    const { data } = await supabase.from("ingly_users").select("*").eq("username", username).limit(1);
    if (data && data.length) return data[0];
  }
  if (email) {
    const { data } = await supabase.from("ingly_users").select("*").eq("email", email).limit(1);
    if (data && data.length) return data[0];
  }
  return null;
}

async function applyToUser(id: string, patch: Record<string, unknown>) {
  patch["updated_at"] = new Date().toISOString();
  await supabase.from("ingly_users").update(patch).eq("id", id);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // Pagamento iniziale completato → attiva licenza
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const user = await findUser({
          username: s.client_reference_id,
          email: s.customer_details?.email ?? s.customer_email,
          customer: (s.customer as string) ?? null,
        });
        if (user) {
          // ricava il piano dal price della subscription
          let plan = "pro";
          if (s.subscription) {
            const sub = await stripe.subscriptions.retrieve(s.subscription as string);
            const priceId = sub.items.data[0]?.price?.id ?? "";
            plan = PRICE_TO_PLAN[priceId] ?? plan;
            await applyToUser(user.id, {
              plan_id: plan,
              status: "active",
              active: true,
              stripe_customer_id: s.customer,
              stripe_subscription_id: s.subscription,
              expires_at: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
            });
          } else {
            await applyToUser(user.id, { status: "active", active: true, stripe_customer_id: s.customer });
          }
        }
        break;
      }

      // Rinnovo mensile riuscito → estende la scadenza
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const user = await findUser({ customer: inv.customer as string, email: inv.customer_email });
        if (user && inv.lines.data[0]?.period?.end) {
          await applyToUser(user.id, {
            status: "active",
            active: true,
            expires_at: new Date(inv.lines.data[0].period.end * 1000).toISOString(),
          });
        }
        break;
      }

      // Pagamento fallito → past_due (l'app avvisa, non blocca subito)
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const user = await findUser({ customer: inv.customer as string, email: inv.customer_email });
        if (user) await applyToUser(user.id, { status: "past_due" });
        break;
      }

      // Abbonamento cancellato → sospende
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const user = await findUser({ customer: sub.customer as string });
        if (user) await applyToUser(user.id, { status: "canceled", active: false });
        break;
      }
    }
  } catch (err) {
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
