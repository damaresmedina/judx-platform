import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerEmail = session.customer_details?.email;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        console.log("[stripe/webhook] checkout.session.completed", {
          email: customerEmail,
          subscriptionId,
          plan: session.metadata?.plan,
        });

        if (customerEmail) {
          // Busca o user no Supabase pelo email
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const user = users?.users?.find((u) => u.email === customerEmail);

          if (user) {
            await supabaseAdmin.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...user.user_metadata,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: session.customer,
                plan: session.metadata?.plan ?? "plus",
                plan_active: true,
              },
            });
            console.log("[stripe/webhook] User metadata updated:", user.id);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        console.log("[stripe/webhook] subscription.updated", {
          customerId,
          status,
        });

        // Busca user pelo stripe_customer_id nos metadados
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.users?.find(
          (u) => u.user_metadata?.stripe_customer_id === customerId
        );

        if (user) {
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              plan_active: status === "active" || status === "trialing",
              subscription_status: status,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        console.log("[stripe/webhook] subscription.deleted", { customerId });

        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.users?.find(
          (u) => u.user_metadata?.stripe_customer_id === customerId
        );

        if (user) {
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              plan: "basic",
              plan_active: false,
              subscription_status: "canceled",
            },
          });
        }
        break;
      }

      default:
        console.log("[stripe/webhook] Unhandled event:", event.type);
    }
  } catch (err) {
    console.error("[stripe/webhook] Error processing event:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
