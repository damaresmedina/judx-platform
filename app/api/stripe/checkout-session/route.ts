import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const plan =
    typeof body === "object" && body && "plan" in body
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (body as any).plan
      : undefined;

  if (plan !== "plus") {
    return NextResponse.json(
      { error: "Plano inválido. Envie { plan: 'plus' }." },
      { status: 400 }
    );
  }

  const origin =
    req.headers.get("origin") ??
    req.headers.get("referer")?.split("/").slice(0, 3).join("/") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  // Não fixamos apiVersion para evitar incompatibilidade com as versões tipadas
  // do `stripe` instaladas no projeto.
  const stripe = new Stripe(stripeSecretKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${origin}/dashboard?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/planos?stripe=cancel`,
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: "JUDX Platform Plus",
              description: "Assinatura mensal (R$97/mês).",
            },
            unit_amount: 9700, // R$ 97,00 em centavos
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: false,
      metadata: {
        plan: "plus",
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Falha ao criar sessão do Stripe Checkout.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

