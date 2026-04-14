import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const priceIdMensal = process.env.STRIPE_PRICE_ID_MENSAL;
const priceIdAnual = process.env.STRIPE_PRICE_ID_ANUAL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(req: NextRequest) {
  try {
    if (!stripeSecretKey) {
      console.error("[/api/checkout] Missing STRIPE_SECRET_KEY");
      return NextResponse.json(
        { error: "Missing environment variable: STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }
    if (!appUrl) {
      console.error("[/api/checkout] Missing NEXT_PUBLIC_APP_URL");
      return NextResponse.json(
        { error: "Missing environment variable: NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const billing = body?.billing === "anual" ? "anual" : "mensal";
    const priceId = billing === "anual" ? priceIdAnual : priceIdMensal;

    if (!priceId) {
      console.error(`[/api/checkout] Missing STRIPE_PRICE_ID_${billing.toUpperCase()}`);
      return NextResponse.json(
        { error: `Price ID não configurado para plano ${billing}.` },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const baseAppUrl = appUrl.replace(/\/+$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseAppUrl}/dashboard?plano=pro&billing=${billing}`,
      cancel_url: `${baseAppUrl}/planos`,
      metadata: {
        plan: "pro",
        billing,
      },
    });

    if (!session.url) {
      console.error("[/api/checkout] Session created without URL", {
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: "Sessão criada sem URL de checkout." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[/api/checkout] Stripe checkout error:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao criar checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
