"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

type Decision = {
  processo: string;
  relator: string;
  data: string; // ISO
  tribunal: "STJ" | "STF";
  ementa: string;
};

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
        <div className="text-xs text-white/60">Painel de jurisprudência</div>
      </div>
    </div>
  );
}

function IconSearch(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconTable(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const decisions: Decision[] = useMemo(
    () => [
      {
        processo: "AREsp 2.123.456/SP",
        relator: "Min. Maria Helena",
        data: "2026-03-10",
        tribunal: "STJ",
        ementa:
          "Responsabilidade civil. Falha na prestação do serviço. Ônus da prova e critérios de quantificação do dano.",
      },
      {
        processo: "AgRg no RE 1.987.654/DF",
        relator: "Min. João Almeida",
        data: "2026-03-08",
        tribunal: "STF",
        ementa:
          "Liberdade de expressão. Limites constitucionais. Análise de proporcionalidade e vedação ao excesso na restrição de direitos.",
      },
      {
        processo: "REsp 1.654.321/RS",
        relator: "Min. Carlos Duarte",
        data: "2026-03-05",
        tribunal: "STJ",
        ementa:
          "Direito processual. Teoria da causa madura. Requisitos. Fundamentação suficiente e efetividade da prestação jurisdicional.",
      },
      {
        processo: "HC 216.789/RJ",
        relator: "Min. Ana Ferreira",
        data: "2026-03-03",
        tribunal: "STF",
        ementa:
          "Habeas corpus. Razoabilidade do prazo. Fundamentação idônea da decisão constritiva. Constrangimento ilegal.",
      },
      {
        processo: "AgInt no REsp 3.021.100/BA",
        relator: "Min. Pedro Santos",
        data: "2026-02-28",
        tribunal: "STJ",
        ementa:
          "Contratos. Revisão de cláusulas. Requisitos e demonstração de onerosidade excessiva. Manutenção do equilíbrio contratual.",
      },
      {
        processo: "ADI 7.123/AL",
        relator: "Min. Ricardo Nascimento",
        data: "2026-02-23",
        tribunal: "STF",
        ementa:
          "Controle concentrado. Inconstitucionalidade formal e material. Parâmetros de proteção de direitos fundamentais e devido processo legislativo.",
      },
    ],
    []
  );

  const activeAlerts = useMemo(
    () => [
      { id: "A1", titulo: "Alerta STJ", detalhes: "Decisões recentes sobre responsabilidade civil." },
      { id: "A2", titulo: "Alerta STF", detalhes: "Jurisprudência consolidada em liberdade de expressão." },
    ],
    []
  );

  const totalSTJ = useMemo(
    () => decisions.filter((d) => d.tribunal === "STJ").length,
    [decisions]
  );
  const totalSTF = useMemo(
    () => decisions.filter((d) => d.tribunal === "STF").length,
    [decisions]
  );

  const filteredDecisions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      // Mostra mais recentes primeiro.
      return [...decisions].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      );
    }

    const match = (value: string) => value.toLowerCase().includes(q);

    return [...decisions]
      .filter((d) => {
        return (
          match(d.processo) ||
          match(d.relator) ||
          match(d.tribunal) ||
          match(d.ementa)
        );
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [decisions, search]);

  const recentDecisions = useMemo(() => filteredDecisions.slice(0, 8), [filteredDecisions]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        const session = data.session;

        if (!session) {
          router.replace("/login");
          return;
        }

        setUserEmail(session.user.email ?? null);
      })
      .finally(() => {
        if (isMounted) setCheckingAuth(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      setUserEmail(session.user.email ?? null);
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
                <div className="text-sm font-semibold text-white/90">Dashboard</div>
                <div className="text-xs text-white/60 flex items-center gap-2">
                  <IconShield className="h-3.5 w-3.5" />
                  Protegido por Supabase Auth
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

      <section className="border-b border-amber-300/30 bg-gradient-to-r from-amber-400/20 via-yellow-300/20 to-blue-400/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-amber-100">
            Você está no plano Basic — Faça upgrade para o Plus por R$97/mês
          </p>
          <Link
            href="/planos"
            className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-[#061A33] transition-colors hover:bg-amber-200"
          >
            Fazer Upgrade
          </Link>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-7">
        <section className="mb-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
              <IconSearch className="h-5 w-5 text-white/70" />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por processo, relator, tribunal ou ementa..."
              className="w-full rounded-2xl border border-white/15 bg-white/5 py-4 pl-12 pr-4 text-sm outline-none placeholder:text-white/50 focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
              aria-label="Buscar por jurisprudência"
            />
          </div>
          <div className="mt-3 text-xs text-white/60">
            {search.trim()
              ? `${filteredDecisions.length} resultado(s) encontrado(s)`
              : `Mostrando ${recentDecisions.length} decisões recentes`}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Total STJ</div>
                <div className="mt-2 text-3xl font-extrabold">{totalSTJ}</div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                <span className="text-blue-200 font-bold">STJ</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Total STF</div>
                <div className="mt-2 text-3xl font-extrabold">{totalSTF}</div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                <span className="text-indigo-200 font-bold">STF</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">
                  Alertas ativos
                </div>
                <div className="mt-2 text-3xl font-extrabold">{activeAlerts.length}</div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center">
                <span className="text-cyan-200 font-bold">!</span>
              </div>
            </div>
            <div className="mt-3 text-sm text-white/70 space-y-1">
              {activeAlerts.slice(0, 2).map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                  <span className="truncate">{a.titulo}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <IconTable className="h-5 w-5 text-white/80" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white/90">
                  Decisões recentes
                </div>
                <div className="text-xs text-white/60">
                  Visualize e filtre por jurisprudência
                </div>
              </div>
            </div>
            <div className="text-xs text-white/60">Atualizadas recentemente</div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#061A33]/70">
                <tr className="text-left text-xs uppercase tracking-wider text-white/60">
                  <th className="py-3 px-5 font-semibold whitespace-nowrap">Processo</th>
                  <th className="py-3 px-5 font-semibold whitespace-nowrap">Relator</th>
                  <th className="py-3 px-5 font-semibold whitespace-nowrap">Data</th>
                  <th className="py-3 px-5 font-semibold whitespace-nowrap">Tribunal</th>
                  <th className="py-3 px-5 font-semibold">Ementa</th>
                </tr>
              </thead>
              <tbody>
                {recentDecisions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-5 text-center text-white/70">
                      Nenhuma decisão encontrada para sua busca.
                    </td>
                  </tr>
                ) : (
                  recentDecisions.map((d) => (
                    <tr
                      key={d.processo}
                      className="border-t border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-4 px-5 whitespace-nowrap font-medium text-white/90">
                        {d.processo}
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap text-white/75">
                        {d.relator}
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap text-white/75">
                        {new Date(d.data).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span
                          className={
                            d.tribunal === "STJ"
                              ? "inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200"
                              : "inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-200"
                          }
                        >
                          {d.tribunal}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <div
                          className="truncate max-w-[320px] text-white/75"
                          title={d.ementa}
                        >
                          {d.ementa}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

