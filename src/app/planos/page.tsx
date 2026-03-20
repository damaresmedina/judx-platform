"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "@/src/lib/supabase";

function JudxLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-700 p-[2px]">
        <div className="flex h-full w-full items-center justify-center rounded-[.75rem] bg-white/10 backdrop-blur">
          <span className="text-base font-black tracking-tight text-white">
            J
          </span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white/90">JUDX Platform</div>
        <div className="text-xs text-white/60">Planos e assinatura</div>
      </div>
    </div>
  );
}

type CheckoutPlan = "plus";

export default function PlanosPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;

        if (!data.session) {
          router.replace("/login");
          return;
        }

        setUserEmail(data.session.user.email ?? null);
      })
      .finally(() => {
        if (isMounted) setCheckingAuth(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session) router.replace("/login");
      setUserEmail(session?.user.email ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleStripeCheckout(plan: CheckoutPlan) {
    setCheckoutError(null);
    setCheckoutLoading(true);

    try {
      if (!stripePromise) {
        throw new Error(
          "Stripe não está configurado. Verifique NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY."
        );
      }

      // Carrega a lib do Stripe (principalmente para validar a configuração).
      await stripePromise;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          payload?.error ??
            "Falha ao iniciar checkout. Tente novamente em instantes."
        );
      }

      const url: string | undefined = payload?.url;
      if (!url) {
        throw new Error(
          "Resposta do Stripe sem URL do checkout. Verifique a configuração."
        );
      }

      window.location.href = url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado no checkout.";
      setCheckoutError(message);
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#061A33] text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/70">Carregando sua sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#061A33] text-white">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#061A33]/70 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <JudxLogo />
              <div className="hidden sm:block">
                <div className="text-sm font-semibold text-white/90">
                  Planos
                </div>
                <div className="text-xs text-white/60">
                  Assinatura segura via Stripe Checkout
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right">
                <div className="text-xs text-white/60">Sessão</div>
                <div className="text-sm font-medium text-white/90 truncate max-w-[220px]">
                  {userEmail ?? "Usuário"}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7">
        <section className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Escolha seu plano</h1>
          <p className="mt-2 text-sm text-white/70">
            Comece com o Basic (gratuito) ou assine o Plus para acessar recursos premium.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">
                  Basic
                </div>
                <div className="mt-2 text-4xl font-extrabold">R$0</div>
                <div className="mt-1 text-sm text-white/60">para sempre</div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <span className="text-sm font-bold text-white/90">B</span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-sm text-white/80">
                Ideal para começar a explorar a jurisprudência.
              </p>
              <div className="space-y-2 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-300/70" />
                  Busca básica
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-300/70" />
                  Lista de decisões recentes
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-300/70" />
                  Interface premium
                </div>
              </div>
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors"
              onClick={() => router.replace("/dashboard")}
            >
              Continuar com Basic
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 p-6 relative overflow-hidden">
            <div
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/25 via-indigo-500/20 to-cyan-500/20 blur-2xl"
              aria-hidden="true"
            />

            <div className="flex items-start justify-between gap-4 relative">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">
                  Plus
                </div>
                <div className="mt-2 text-4xl font-extrabold">R$97</div>
                <div className="mt-1 text-sm text-white/60">por mês</div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                <span className="text-sm font-bold text-blue-200">+</span>
              </div>
            </div>

            <div className="mt-5 space-y-3 relative">
              <p className="text-sm text-white/80">
                Mais produtividade para acompanhar tendências e alertas.
              </p>

              <div className="space-y-2 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                  Busca avançada
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                  Alertas ativos e priorizados
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                  Ementas com melhor detalhamento
                </div>
              </div>
            </div>

            {checkoutError ? (
              <div
                className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 relative"
                role="alert"
                aria-live="polite"
              >
                {checkoutError}
              </div>
            ) : null}

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={() => handleStripeCheckout("plus")}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-cyan-600/10 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/30 relative"
            >
              {checkoutLoading ? "Redirecionando..." : "Assinar Plus com Stripe"}
            </button>

            <div className="mt-3 text-xs text-white/60 relative">
              Ao assinar, você será direcionado ao Stripe Checkout para concluir o pagamento.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

