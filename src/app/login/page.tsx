"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

function JudxLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-orange-500 p-[2px]">
        <div className="flex h-full w-full items-center justify-center rounded-[.75rem] bg-white/10 backdrop-blur">
          <span className="text-lg font-black tracking-tight text-white">
            J
          </span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-foreground/80">
          JUDX Platform
        </div>
        <div className="text-xs text-foreground/60">
          Acesso seguro e rápido
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Se já tiver sessão ativa, direciona para a área principal.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-stretch">
        <section className="hidden md:flex flex-col justify-between p-10 rounded-3xl bg-white/50 dark:bg-zinc-900/40 border border-white/70 dark:border-white/10 backdrop-blur">
          <div className="flex flex-col gap-6">
            <JudxLogo />
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Login
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                Entre com seu e-mail e senha para acessar sua conta no{" "}
                <span className="font-semibold text-foreground">JUDX</span>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
              <p className="text-sm text-foreground/70">
                Autenticação segura com Supabase.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-500" />
              <p className="text-sm text-foreground/70">
                Sessão persistente para facilitar o acesso.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-orange-500" />
              <p className="text-sm text-foreground/70">
                Interface profissional e responsiva.
              </p>
            </div>
          </div>
        </section>

        <section className="relative rounded-3xl bg-white/70 dark:bg-zinc-900/50 border border-white/80 dark:border-white/10 backdrop-blur p-8 sm:p-10 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/20 to-orange-500/20 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/15 to-orange-500/15 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative">
            <div className="md:hidden mb-6">
              <JudxLogo />
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
                Entrar
              </h1>
              <p className="mt-2 text-sm text-foreground/70">
                Use suas credenciais para continuar.
              </p>
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground/80"
                >
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  required
                  className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none ring-0 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                  className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none ring-0 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {error ? (
                <div
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-fuchsia-600/10 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-foreground/60">
                  Ao continuar, você concorda com nossos termos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Placeholder: se você quiser, depois conectamos uma rota real de recuperação.
                    setError("Recuperação de senha ainda não configurada.");
                  }}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

