"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

type Decision = {
  processo: string;
  relator: string;
  data: string;
  tribunal: "STJ" | "STF";
  descricao: string;
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default function DashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [totalSTJ, setTotalSTJ] = useState<number | null>(null);
  const [totalSTF, setTotalSTF] = useState<number | null>(null);
  const [totalPartes, setTotalPartes] = useState<number | null>(null);
  const [recentRows, setRecentRows] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recentRows;
    return recentRows
      .filter(
        (d) =>
          d.processo.toLowerCase().includes(q) ||
          d.relator.toLowerCase().includes(q) ||
          d.tribunal.toLowerCase().includes(q) ||
          d.descricao.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [recentRows, search]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) { router.replace("/login"); return; }
      setUserEmail(data.session.user.email ?? null);
    }).finally(() => { if (mounted) setCheckingAuth(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      if (!session) { router.replace("/login"); return; }
      setUserEmail(session.user.email ?? null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const [stfCount, stjCount, partesCount, stfRecent, stjRecent] = await Promise.all([
        supabase.from("stf_master").select("*", { count: "exact", head: true }),
        supabase.from("stj_decisoes_dj").select("*", { count: "exact", head: true }),
        supabase.from("stf_partes_completo").select("*", { count: "exact", head: true }),
        supabase.from("stf_master").select("processo, relator, data_decisao, tipo_decisao").order("data_decisao", { ascending: false }).limit(5),
        supabase.from("stj_decisoes_dj").select("processo, relator, data_julgamento, ementa").order("data_julgamento", { ascending: false }).limit(5),
      ]);

      if (cancelled) return;

      if (stfCount.error || stjCount.error || partesCount.error) {
        setError(stfCount.error?.message ?? stjCount.error?.message ?? partesCount.error?.message ?? "Erro");
        setLoading(false);
        return;
      }

      setTotalSTF(stfCount.count ?? 0);
      setTotalSTJ(stjCount.count ?? 0);
      setTotalPartes(partesCount.count ?? 0);

      const stfRows: Decision[] = (stfRecent.data ?? []).map((r) => ({
        processo: r.processo, relator: r.relator || "—",
        data: r.data_decisao ?? "", tribunal: "STF" as const,
        descricao: r.tipo_decisao || "—",
      }));
      const stjRows: Decision[] = (stjRecent.data ?? []).map((r) => ({
        processo: r.processo, relator: r.relator || "—",
        data: r.data_julgamento ?? "", tribunal: "STJ" as const,
        descricao: r.ementa ? (r.ementa.length > 100 ? r.ementa.slice(0, 100) + "…" : r.ementa) : "—",
      }));

      setRecentRows([...stfRows, ...stjRows].sort((a, b) => (b.data || "").localeCompare(a.data || "")));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [checkingAuth]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1f35", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,.5)", fontFamily: "'DM Sans', sans-serif", fontSize: ".9rem" }}>Carregando sessão…</p>
      </div>
    );
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        :root { --navy: #0d1f35; --navy-light: #162d4a; --gold: #c8922a; --gold-light: #e8b44a; --cream: #f5f0e8; --cream-dark: #e8e0d0; --text: #1a1a2e; --muted: #6b7280; --white: #ffffff; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; background: var(--cream); color: var(--text); }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f5f0e8" }}>
        {/* NAV */}
        <nav style={{ background: "#0d1f35", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 4rem", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <Link href="/" style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.4rem", fontWeight: 700, color: "#fff", textDecoration: "none" }}>
            Jud<span style={{ color: "#c8922a" }}>X</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <span style={{ fontSize: ".78rem", color: "rgba(255,255,255,.4)" }}>{userEmail}</span>
            <button onClick={handleSignOut} style={{ fontSize: ".75rem", color: "rgba(255,255,255,.4)", letterSpacing: ".1em", textTransform: "uppercase", background: "none", border: "1px solid rgba(255,255,255,.15)", padding: ".5rem 1.2rem", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all .2s" }}>
              Sair
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ background: "#0d1f35", padding: "4rem 4rem 3rem", position: "relative" }}>
          <div style={{ fontSize: ".7rem", letterSpacing: ".2em", textTransform: "uppercase", color: "#c8922a", fontWeight: 500, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
            <span style={{ display: "block", width: 32, height: 1, background: "#c8922a" }} />
            Painel do assinante
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(2rem, 4vw, 3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1rem" }}>
            Seus <em style={{ fontStyle: "italic", color: "#c8922a" }}>dados.</em>
          </h1>
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,.5)", lineHeight: 1.7, maxWidth: 500, fontWeight: 300 }}>
            Acesso direto ao corpus completo do STF e STJ. Decisões, partes e relatores — tudo auditado.
          </p>

          <div style={{ display: "flex", gap: "4rem", borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: "2rem", marginTop: "2.5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", fontWeight: 700, color: "#c8922a", lineHeight: 1 }}>
                {loading ? "…" : totalSTF !== null ? fmt(totalSTF) : "—"}
              </div>
              <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.3)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".3rem" }}>Decisões STF</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", fontWeight: 700, color: "#4a9eca", lineHeight: 1 }}>
                {loading ? "…" : totalSTJ !== null ? fmt(totalSTJ) : "—"}
              </div>
              <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.3)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".3rem" }}>Decisões STJ</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", fontWeight: 700, color: "#c8922a", lineHeight: 1 }}>
                {loading ? "…" : totalPartes !== null ? fmt(totalPartes) : "—"}
              </div>
              <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.3)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".3rem" }}>Partes mapeadas</div>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, #c8922a, transparent)" }} />
        </section>

        {error && (
          <div style={{ background: "#fef3cd", padding: "1rem 4rem", fontSize: ".85rem", color: "#856404" }}>
            {error}
          </div>
        )}

        {/* BUSCA */}
        <section style={{ padding: "3rem 4rem 1rem" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por processo, relator, tribunal…"
            style={{ width: "100%", padding: ".9rem 1.2rem", background: "#fff", border: "1px solid #e8e0d0", fontFamily: "'DM Sans', sans-serif", fontSize: ".9rem", outline: "none", color: "#1a1a2e" }}
          />
          <div style={{ marginTop: ".5rem", fontSize: ".75rem", color: "#6b7280" }}>
            {search.trim() ? `${filtered.length} resultado(s)` : `${filtered.length} decisões recentes`}
          </div>
        </section>

        {/* TABELA */}
        <section style={{ padding: "1rem 4rem 4rem" }}>
          <div style={{ background: "#fff", border: "1px solid #e8e0d0", overflow: "hidden" }}>
            <div style={{ padding: "1.2rem 1.5rem", borderBottom: "1px solid #e8e0d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", fontWeight: 700, color: "#0d1f35" }}>Decisões recentes — STF + STJ</span>
              <span style={{ fontSize: ".7rem", color: "#6b7280", fontFamily: "'DM Mono', monospace" }}>
                {loading ? "carregando…" : `${filtered.length} registros`}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
              <thead style={{ background: "#f5f0e8" }}>
                <tr>
                  {["Processo", "Relator", "Data", "Tribunal", "Decisão"].map((h) => (
                    <th key={h} style={{ padding: ".8rem 1.5rem", textAlign: "left", fontSize: ".7rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>
                    {search.trim() ? "Nenhum resultado." : "Nenhuma decisão encontrada."}
                  </td></tr>
                ) : (
                  filtered.map((d, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #e8e0d0" }}>
                      <td style={{ padding: ".8rem 1.5rem", fontWeight: 500, whiteSpace: "nowrap", color: "#1a1a2e" }}>{d.processo}</td>
                      <td style={{ padding: ".8rem 1.5rem", whiteSpace: "nowrap", color: "#1a1a2e" }}>{d.relator}</td>
                      <td style={{ padding: ".8rem 1.5rem", whiteSpace: "nowrap", color: "#6b7280" }}>{d.data ? new Date(d.data).toLocaleDateString("pt-BR") : "—"}</td>
                      <td style={{ padding: ".8rem 1.5rem" }}>
                        <span style={{
                          display: "inline-block", padding: ".2rem .6rem", fontSize: ".7rem", fontWeight: 600, letterSpacing: ".05em",
                          background: d.tribunal === "STF" ? "rgba(200,146,42,.12)" : "rgba(74,158,202,.12)",
                          color: d.tribunal === "STF" ? "#c8922a" : "#4a9eca",
                        }}>{d.tribunal}</span>
                      </td>
                      <td style={{ padding: ".8rem 1.5rem", color: "#6b7280", maxWidth: 300 }}>{d.descricao}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background: "#0d1f35", padding: "2rem 4rem", textAlign: "center", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.25)", letterSpacing: ".1em" }}>
            JudX — Inteligência Jurisprudencial · <Link href="/" style={{ color: "#c8922a", textDecoration: "none" }}>judx.com.br</Link> · © 2026
          </span>
        </footer>
      </div>
    </>
  );
}
