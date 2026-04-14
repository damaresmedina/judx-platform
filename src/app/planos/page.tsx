"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

type Billing = "mensal" | "anual";

export default function PlanosPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>("mensal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setUserEmail(data.session.user.email ?? null);
      })
      .finally(() => {
        if (mounted) setCheckingAuth(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) router.replace("/login");
      setUserEmail(session?.user.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "plus", billing }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(payload?.error ?? "Falha ao iniciar checkout.");
      if (!payload?.url)
        throw new Error("Resposta sem URL de checkout.");
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1f35", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,.5)", fontFamily: "'DM Sans', sans-serif", fontSize: ".9rem" }}>Carregando...</p>
      </div>
    );
  }

  const mensal = 97;
  const anual = 970;
  const mensalDoAnual = Math.round(anual / 12);
  const economia = mensal * 12 - anual;

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; background: #0d1f35; color: #fff; }
        .pricing-toggle { display: flex; background: rgba(255,255,255,.06); border-radius: 12px; padding: 4px; border: 1px solid rgba(255,255,255,.08); }
        .pricing-toggle button { flex: 1; padding: 10px 24px; border: none; background: transparent; color: rgba(255,255,255,.5); font-family: 'DM Sans', sans-serif; font-size: .85rem; font-weight: 500; cursor: pointer; border-radius: 9px; transition: all .2s; }
        .pricing-toggle button.active { background: rgba(200,146,42,.15); color: #e8b44a; font-weight: 600; }
        .feature-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; }
        .feature-check { width: 20px; height: 20px; border-radius: 50%; background: rgba(200,146,42,.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
        .cta-btn { width: 100%; padding: 16px; border: none; border-radius: 12px; font-family: 'DM Sans', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all .25s; }
        .cta-btn:disabled { opacity: .6; cursor: not-allowed; }
        .cta-btn-primary { background: linear-gradient(135deg, #c8922a 0%, #e8b44a 100%); color: #0d1f35; }
        .cta-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(200,146,42,.3); }
        .cta-btn-secondary { background: rgba(255,255,255,.06); color: rgba(255,255,255,.7); border: 1px solid rgba(255,255,255,.1); }
        .cta-btn-secondary:hover { background: rgba(255,255,255,.1); }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: .7rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
        @media (max-width: 768px) {
          .plans-grid { grid-template-columns: 1fr !important; }
          .hero-section { padding: 3rem 1.5rem 2rem !important; }
          .plans-section { padding: 0 1.5rem 3rem !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0d1f35" }}>
        {/* NAV */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.2rem 4rem", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <a href="/" style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 700, color: "#fff", textDecoration: "none" }}>
            Jud<span style={{ color: "#c8922a" }}>X</span>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            {userEmail && (
              <span style={{ fontSize: ".75rem", color: "rgba(255,255,255,.35)" }}>{userEmail}</span>
            )}
            <button onClick={handleSignOut} style={{ fontSize: ".7rem", color: "rgba(255,255,255,.4)", letterSpacing: ".1em", textTransform: "uppercase", background: "none", border: "1px solid rgba(255,255,255,.12)", padding: ".45rem 1rem", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", borderRadius: 8 }}>
              Sair
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero-section" style={{ padding: "5rem 4rem 3rem", textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "inline-block", marginBottom: "1.5rem" }}>
            <span className="badge" style={{ background: "rgba(200,146,42,.12)", color: "#e8b44a" }}>
              Acesso completo
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 900, lineHeight: 1.15, marginBottom: "1rem" }}>
            Pare de adivinhar.<br />
            <span style={{ color: "#c8922a", fontStyle: "italic" }}>Use dados.</span>
          </h1>
          <p style={{ fontSize: "1.05rem", color: "rgba(255,255,255,.55)", lineHeight: 1.7, maxWidth: 540, margin: "0 auto", fontWeight: 300 }}>
            +2,9 milhões de decisões do STF e STJ processadas, auditadas e prontas para consulta. Taxa de provimento, risco processual, relatores, partes — tudo em um lugar.
          </p>
        </section>

        {/* TOGGLE MENSAL/ANUAL */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem" }}>
          <div className="pricing-toggle">
            <button
              className={billing === "mensal" ? "active" : ""}
              onClick={() => setBilling("mensal")}
            >
              Mensal
            </button>
            <button
              className={billing === "anual" ? "active" : ""}
              onClick={() => setBilling("anual")}
            >
              Anual
              <span style={{ marginLeft: 6, fontSize: ".7rem", color: "#4ade80", fontWeight: 600 }}>
                -R${economia}
              </span>
            </button>
          </div>
        </div>

        {/* CARDS */}
        <section className="plans-section" style={{ padding: "0 4rem 5rem", maxWidth: 960, margin: "0 auto" }}>
          <div className="plans-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

            {/* BASIC */}
            <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "2.5rem 2rem" }}>
              <div style={{ fontSize: ".7rem", letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", fontWeight: 600, marginBottom: "1rem" }}>
                Gratuito
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: ".3rem" }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.8rem", fontWeight: 900 }}>R$0</span>
              </div>
              <p style={{ fontSize: ".85rem", color: "rgba(255,255,255,.4)", marginBottom: "2rem" }}>
                Para sempre, sem cartao
              </p>

              <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: "1.5rem", marginBottom: "2rem" }}>
                {["Busca de decisoes STF e STJ", "Ultimas decisoes publicadas", "Interface completa"].map((f, i) => (
                  <div className="feature-row" key={i}>
                    <div className="feature-check">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: ".88rem", color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                className="cta-btn cta-btn-secondary"
                onClick={() => router.push("/dashboard")}
              >
                Continuar gratis
              </button>
            </div>

            {/* PLUS */}
            <div style={{ background: "linear-gradient(165deg, rgba(200,146,42,.08) 0%, rgba(200,146,42,.02) 100%)", border: "1px solid rgba(200,146,42,.2)", borderRadius: 20, padding: "2.5rem 2rem", position: "relative" }}>
              <div style={{ position: "absolute", top: -1, left: 40, right: 40, height: 2, background: "linear-gradient(90deg, transparent, #c8922a, transparent)", borderRadius: "0 0 2px 2px" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div style={{ fontSize: ".7rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#e8b44a", fontWeight: 600 }}>
                  Plus
                </div>
                <span className="badge" style={{ background: "rgba(74,222,128,.1)", color: "#4ade80" }}>
                  Mais popular
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: ".3rem" }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.8rem", fontWeight: 900, color: "#fff" }}>
                  R${billing === "mensal" ? mensal : mensalDoAnual}
                </span>
                <span style={{ fontSize: ".9rem", color: "rgba(255,255,255,.4)" }}>/mes</span>
              </div>
              <p style={{ fontSize: ".85rem", color: "rgba(255,255,255,.4)", marginBottom: "2rem" }}>
                {billing === "mensal"
                  ? "Cobrado mensalmente, cancele quando quiser"
                  : `R$${anual}/ano — economia de R$${economia}`
                }
              </p>

              <div style={{ borderTop: "1px solid rgba(200,146,42,.12)", paddingTop: "1.5rem", marginBottom: "2rem" }}>
                {[
                  "Tudo do plano gratuito",
                  "Taxa de provimento por tema e relator",
                  "Risco processual com dados reais",
                  "Alertas de decisoes por tema",
                  "Filtros avancados e exportacao",
                  "Mapeamento completo de partes",
                  "Dados auditados — fonte STF/STJ oficial",
                ].map((f, i) => (
                  <div className="feature-row" key={i}>
                    <div className="feature-check">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#c8922a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: ".88rem", color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                      {i === 0 ? <strong>{f}</strong> : f}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10, padding: ".75rem 1rem", marginBottom: "1rem", fontSize: ".82rem", color: "#fca5a5" }}>
                  {error}
                </div>
              )}

              <button
                className="cta-btn cta-btn-primary"
                disabled={loading}
                onClick={handleCheckout}
              >
                {loading ? "Redirecionando para pagamento..." : billing === "mensal" ? "Assinar por R$97/mes" : `Assinar por R$970/ano`}
              </button>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "1rem" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5v3.75M6 1.5L4.5 3M6 1.5L7.5 3M2.25 5.25h7.5c.414 0 .75.336.75.75v3.75c0 .414-.336.75-.75.75H2.25c-.414 0-.75-.336-.75-.75V6c0-.414.336-.75.75-.75z" stroke="rgba(255,255,255,.3)" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.3)" }}>Pagamento seguro via Stripe. Cancele a qualquer momento.</span>
              </div>
            </div>
          </div>

          {/* SOCIAL PROOF / NUMBERS */}
          <div style={{ display: "flex", justifyContent: "center", gap: "4rem", marginTop: "4rem", paddingTop: "2.5rem", borderTop: "1px solid rgba(255,255,255,.06)", flexWrap: "wrap" }}>
            {[
              { num: "2,9M+", label: "decisoes processadas" },
              { num: "1,2M+", label: "partes mapeadas" },
              { num: "25+", label: "anos de jurisprudencia" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", fontWeight: 900, color: "#c8922a" }}>{s.num}</div>
                <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".25rem" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* FAQ RAPIDO */}
          <div style={{ maxWidth: 600, margin: "4rem auto 0" }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 700, marginBottom: "1.5rem", textAlign: "center" }}>
              Perguntas frequentes
            </h3>
            {[
              {
                q: "Posso cancelar a qualquer momento?",
                a: "Sim. Sem multa, sem fidelidade. Cancele direto no seu painel e o acesso segue ate o fim do periodo pago."
              },
              {
                q: "De onde vem os dados?",
                a: "Fontes oficiais: portal do STF, STJ, Corte Aberta e Datajud/CNJ. Tudo auditado antes de entrar na plataforma."
              },
              {
                q: "Qual a diferenca do plano gratuito?",
                a: "O Plus desbloqueia taxa de provimento, risco processual, alertas, filtros avancados e exportacao de dados."
              },
            ].map((faq, i) => (
              <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "1.2rem 0" }}>
                <div style={{ fontSize: ".9rem", fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: ".4rem" }}>{faq.q}</div>
                <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,.45)", lineHeight: 1.6 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "1.5rem 4rem", textAlign: "center" }}>
          <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.2)", letterSpacing: ".08em" }}>
            JudX — Inteligencia Jurisprudencial · judx.com.br · 2026
          </span>
        </footer>
      </div>
    </>
  );
}
