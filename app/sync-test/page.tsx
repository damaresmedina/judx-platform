"use client";

import { useState } from "react";

type SyncResult =
  | { success: true; inserted: number }
  | { success: false; error: string }
  | null;

export default function SyncTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult>(null);
  const [rawText, setRawText] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    setRawText(null);
    try {
      const res = await fetch("/api/sync-stj", { method: "POST" });
      const text = await res.text();
      setRawText(text);
      try {
        const data = JSON.parse(text) as SyncResult;
        setResult(data);
      } catch {
        setResult(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede";
      setRawText(msg);
      setResult({ success: false, error: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-[family-name:var(--font-geist-sans)] text-zinc-900">
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Teste de sincronização STJ
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Dispara um POST para <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-xs">/api/sync-stj</code> e exibe a resposta.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Sincronizando…" : "Sincronizar STJ"}
        </button>

        {(result !== null || rawText !== null) && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Resultado
            </p>
            {result && result.success && (
              <p className="mt-2 text-sm text-emerald-700">
                Sucesso — {result.inserted} registro(s) inserido(s).
              </p>
            )}
            {result && !result.success && (
              <p className="mt-2 text-sm text-red-700">{result.error}</p>
            )}
            {rawText && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">
                {rawText}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
