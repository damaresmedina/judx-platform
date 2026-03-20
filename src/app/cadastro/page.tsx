"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase";

function JudxLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-700 p-[2px]">
        <div className="flex h-full w-full items-center justify-center rounded-[.75rem] bg-white/10 backdrop-blur">
          <span className="text-lg font-black tracking-tight text-white">J</span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white/90">JUDX Platform</div>
        <div className="text-xs text-white/60">Acesso seguro e rápido</div>
      </div>
    </div>
  );
}

export default function CadastroPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        if (data.session) router.replace("/dashboard");
      })
      .finally(() => {
        if (isMounted) setCheckingAuth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Se o projeto estiver configurado para não exigir confirmação, a sessão pode vir imediatamente.
      if (data.session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setSuccess(
        "Cadastro criado! Verifique seu e-mail para confirmar a conta."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#061A33] text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/70">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#061A33] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-stretch">
        <section className="hidden md:flex flex-col justify-between p-10 rounded-3xl bg-white/5 border border-white/10 backdrop-blur">
          <div className="flex flex-col gap-6">
            <JudxLogo />
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Cadastro</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Crie sua conta no <span className="font-semibold text-white">JUDX</span>{" "}
                e acesse jurisprudência com segurança.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500" />
              <p className="text-sm text-white/70">Autenticação segura com Supabase.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500" />
              <p className="text-sm text-white/70">Sessão persistente para facilitar o acesso.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500" />
              <p className="text-sm text-white/70">Interface profissional e responsiva.</p>
            </div>
          </div>
        </section>

        <section className="relative rounded-3xl bg-white/5 border border-white/10 backdrop-blur p-8 sm:p-10 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/20 via-indigo-500/20 to-cyan-500/20 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/15 via-indigo-500/15 to-cyan-500/15 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative">
            <div className="md:hidden mb-6">
              <JudxLogo />
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
                Criar conta
              </h1>
              <p className="mt-2 text-sm text-white/70">
                Informe seu e-mail e senha para continuar.
              </p>
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-white/90"
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
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none ring-0 placeholder:text-white/50 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-white/90"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Crie uma senha"
                  required
                  minLength={6}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none ring-0 placeholder:text-white/50 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-2 text-xs text-white/60">
                  Use pelo menos 6 caracteres.
                </p>
              </div>

              {error ? (
                <div
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                  role="status"
                  aria-live="polite"
                >
                  {success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-cyan-600/10 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {loading ? "Criando..." : "Criar conta"}
              </button>

              <div className="pt-2 text-center text-xs text-white/60">
                Ao continuar, você concorda com nossos termos.
              </div>

              <div className="pt-5 text-center text-xs text-white/60">
                <span>Já tem conta?</span>{" "}
                <Link
                  href="/login"
                  className="font-medium text-cyan-200 hover:text-cyan-100"
                >
                  Entrar
                </Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

