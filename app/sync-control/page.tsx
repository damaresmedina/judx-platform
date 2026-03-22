"use client";

import { useEffect, useState } from "react";

type JobState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; ok: boolean; durationMs: number; summary: string; raw: string };

type DistJobState =
  | { status: "idle" }
  | { status: "running"; current: number; total: number | null }
  | { status: "done"; ok: boolean; durationMs: number; summary: string; raw: string };

async function postJson(path: string): Promise<{ durationMs: number; text: string }> {
  const t0 = performance.now();
  const res = await fetch(path, { method: "POST" });
  const text = await res.text();
  return { durationMs: Math.round(performance.now() - t0), text };
}

type DistribApiJson = {
  success?: boolean;
  inserted?: number;
  totalFiles?: number;
  fileIndex?: number;
  resourcesProcessed?: number;
  failed?: { error: string }[];
  invalidOffset?: boolean;
};

async function postDistribOffset(offset: number): Promise<{ ok: boolean; status: number; json: DistribApiJson; text: string }> {
  const res = await fetch("/api/sync-stj-distribuicao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset }),
  });
  const text = await res.text();
  let json: DistribApiJson = {};
  try {
    json = JSON.parse(text) as DistribApiJson;
  } catch {
    /* ignore */
  }
  const ok = res.ok;
  return { ok, status: res.status, json, text };
}

function formatDjSummary(text: string): string {
  try {
    const j = JSON.parse(text) as {
      success?: boolean;
      inserted?: number;
      resourcesProcessed?: number;
      failed?: { error: string }[];
      durationMs?: number;
    };
    const fails = j.failed?.length ?? 0;
    return `Inseridos/atualizados: ${j.inserted ?? "—"} · Arquivos: ${j.resourcesProcessed ?? "—"} · Falhas: ${fails}`;
  } catch {
    return text.slice(0, 500);
  }
}

function formatPrecedentesSummary(text: string): string {
  try {
    const j = JSON.parse(text) as {
      success?: boolean;
      temasUpserted?: number;
      processosUpserted?: number;
      error?: string;
    };
    if (j.error) return j.error;
    return `Temas: ${j.temasUpserted ?? "—"} · Processos: ${j.processosUpserted ?? "—"}`;
  } catch {
    return text.slice(0, 500);
  }
}

function formatDistribFullSummary(parts: {
  totalFiles: number;
  inserted: number;
  fileErrors: number;
  failDetails: number;
}): string {
  return `Inseridos/atualizados: ${parts.inserted} · Arquivos: ${parts.totalFiles} · Arquivos com erro: ${parts.fileErrors} · Entradas em falhas: ${parts.failDetails}`;
}

function formatBackupSummary(text: string): string {
  try {
    const j = JSON.parse(text) as {
      path?: string;
      bytes?: number;
      tables?: Record<string, number>;
      tableErrors?: Record<string, string>;
    };
    const parts = j.tables ? Object.entries(j.tables).map(([k, v]) => `${k}: ${v}`) : [];
    const errN = j.tableErrors ? Object.keys(j.tableErrors).length : 0;
    const errHint = errN > 0 ? ` · Avisos em ${errN} tabela(s)` : "";
    return `Arquivo: ${j.path ?? "—"} · ${(j.bytes ?? 0).toLocaleString("pt-BR")} bytes · ${parts.join(" · ")}${errHint}`;
  } catch {
    return text.slice(0, 500);
  }
}

function useElapsedMs(running: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) {
      setMs(0);
      return;
    }
    const t0 = performance.now();
    const id = setInterval(() => setMs(Math.round(performance.now() - t0)), 200);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}

function formatEspelhosSummary(text: string): string {
  try {
    const j = JSON.parse(text) as {
      inserted?: number;
      datasetsSucceeded?: number;
      failed?: unknown[];
    };
    const fails = j.failed?.length ?? 0;
    return `Registros: ${j.inserted ?? "—"} · Datasets OK: ${j.datasetsSucceeded ?? "—"} · Falhas: ${fails}`;
  } catch {
    return text.slice(0, 500);
  }
}

export default function SyncControlPage() {
  const [espelhos, setEspelhos] = useState<JobState>({ status: "idle" });
  const [dj, setDj] = useState<JobState>({ status: "idle" });
  const [precedentes, setPrecedentes] = useState<JobState>({ status: "idle" });
  const [dist, setDist] = useState<DistJobState>({ status: "idle" });
  const [backup, setBackup] = useState<JobState>({ status: "idle" });

  async function runDistrib() {
    const t0 = performance.now();
    setDist({ status: "running", current: 1, total: null });
    const rawParts: string[] = [];
    try {
      let totalInserted = 0;
      let fileErrors = 0;
      let failDetails = 0;

      const accumulate = (json: DistribApiJson) => {
        totalInserted += json.inserted ?? 0;
        const nFail = json.failed?.length ?? 0;
        failDetails += nFail;
        const chunkOk = json.success !== false && nFail === 0;
        if (!chunkOk) fileErrors++;
      };

      const parseTotalFiles = (json: DistribApiJson): number => {
        const t = json.totalFiles;
        if (typeof t === "number" && Number.isFinite(t)) return Math.max(0, Math.trunc(t));
        if (typeof t === "string" && t.trim() !== "") {
          const n = Number(t);
          if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
        }
        return 0;
      };

      const abort = (summary: string) => {
        setDist({
          status: "done",
          ok: false,
          durationMs: Math.round(performance.now() - t0),
          summary,
          raw: rawParts.join("\n---\n"),
        });
      };

      // 1) POST { offset: 0 } — resposta traz totalFiles
      const r0 = await postDistribOffset(0);
      rawParts.push(r0.text);

      if (r0.status === 400 && r0.json.invalidOffset) {
        abort(r0.json.failed?.[0]?.error ?? "Requisição inválida.");
        return;
      }
      if (!r0.ok) {
        abort(`HTTP ${r0.status}: ${r0.text.slice(0, 400)}`);
        return;
      }

      const totalFiles = parseTotalFiles(r0.json);
      accumulate(r0.json);

      if (totalFiles === 0) {
        const durationMs = Math.round(performance.now() - t0);
        setDist({
          status: "done",
          ok: fileErrors === 0 && failDetails === 0,
          durationMs,
          summary: formatDistribFullSummary({
            totalFiles: 0,
            inserted: totalInserted,
            fileErrors,
            failDetails,
          }),
          raw: rawParts.join("\n---\n"),
        });
        return;
      }

      setDist({ status: "running", current: 1, total: totalFiles });

      // 2) POST { offset: 1 } … { offset: totalFiles - 1 }
      for (let offset = 1; offset < totalFiles; offset++) {
        setDist({ status: "running", current: offset + 1, total: totalFiles });
        const { ok, status, json, text } = await postDistribOffset(offset);
        rawParts.push(text);

        if (status === 400 && json.invalidOffset) {
          abort(json.failed?.[0]?.error ?? "Requisição inválida.");
          return;
        }
        if (!ok) {
          abort(`HTTP ${status}: ${text.slice(0, 400)}`);
          return;
        }

        accumulate(json);
      }

      const durationMs = Math.round(performance.now() - t0);
      const summary = formatDistribFullSummary({
        totalFiles,
        inserted: totalInserted,
        fileErrors,
        failDetails,
      });
      setDist({
        status: "done",
        ok: fileErrors === 0 && failDetails === 0,
        durationMs,
        summary,
        raw: rawParts.join("\n---\n"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede";
      setDist({
        status: "done",
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        summary: msg,
        raw: rawParts.join("\n---\n"),
      });
    }
  }

  async function run(
    path: string,
    set: (s: JobState) => void,
    summarize: (t: string) => string,
  ) {
    set({ status: "running" });
    try {
      const { durationMs, text } = await postJson(path);
      let ok = false;
      try {
        const j = JSON.parse(text) as { success?: boolean };
        ok = j.success !== false;
      } catch {
        ok = false;
      }
      set({
        status: "done",
        ok,
        durationMs,
        summary: summarize(text),
        raw: text,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede";
      set({
        status: "done",
        ok: false,
        durationMs: 0,
        summary: msg,
        raw: msg,
      });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-[family-name:var(--font-geist-sans)] text-zinc-900">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-16">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Controle de sincronização STJ</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Dispara cada carga ou o backup. Tempos e totais vêm da resposta da API.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <JobButton
            label="Espelhos de acórdãos (stj_decisions)"
            path="/api/sync-stj"
            state={espelhos}
            onClick={() => run("/api/sync-stj", setEspelhos, formatEspelhosSummary)}
          />
          <JobButton
            label="DJ — íntegras do Diário (stj_decisoes_dj)"
            path="/api/sync-stj-dj"
            state={dj}
            onClick={() => run("/api/sync-stj-dj", setDj, formatDjSummary)}
          />
          <JobButton
            label="Precedentes qualificados (temas + processos)"
            path="/api/sync-stj-precedentes"
            state={precedentes}
            onClick={() => run("/api/sync-stj-precedentes", setPrecedentes, formatPrecedentesSummary)}
          />
          <DistribJobButton state={dist} onRun={runDistrib} />
          <JobButton
            label="Backup JSON (Storage backups/)"
            path="/api/backup"
            state={backup}
            onClick={() => run("/api/backup", setBackup, formatBackupSummary)}
          />
        </section>
      </div>
    </div>
  );
}

function DistribJobButton(props: { state: DistJobState; onRun: () => void }) {
  const loading = props.state.status === "running";
  const elapsedMs = useElapsedMs(loading);
  const progress =
    props.state.status === "running"
      ? props.state.total != null
        ? `Processando arquivo ${props.state.current} de ${props.state.total}…`
        : `Processando arquivo ${props.state.current}…`
      : null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Atas de distribuição (stj_distribuicao)</p>
          <p className="mt-0.5 text-xs text-zinc-500">/api/sync-stj-distribuicao (uma ata por requisição, offset no JSON)</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Lote completo (manual): <span className="font-mono">/api/sync-stj-distribuicao-all</span>
          </p>
          {loading && progress && (
            <p className="mt-1 font-mono text-xs tabular-nums text-zinc-600">
              {progress} {(elapsedMs / 1000).toFixed(1)} s
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={props.onRun}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Executando…" : "Executar"}
        </button>
      </div>
      {props.state.status === "done" && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <p className={`text-sm ${props.state.ok ? "text-emerald-700" : "text-red-700"}`}>
            {props.state.ok ? "Concluído" : "Falha ou avisos"} · {props.state.durationMs} ms
          </p>
          <p className="mt-1 text-xs text-zinc-700">{props.state.summary}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-500">JSON bruto</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
              {props.state.raw}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function JobButton(props: {
  label: string;
  path: string;
  state: JobState;
  onClick: () => void;
}) {
  const loading = props.state.status === "running";
  const elapsedMs = useElapsedMs(loading);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{props.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{props.path}</p>
          {loading && (
            <p className="mt-1 font-mono text-xs tabular-nums text-zinc-600">
              Em execução… {(elapsedMs / 1000).toFixed(1)} s
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={props.onClick}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Executando…" : "Executar"}
        </button>
      </div>
      {props.state.status === "done" && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <p className={`text-sm ${props.state.ok ? "text-emerald-700" : "text-red-700"}`}>
            {props.state.ok ? "Concluído" : "Falha ou avisos"} · {props.state.durationMs} ms
          </p>
          <p className="mt-1 text-xs text-zinc-700">{props.state.summary}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-500">JSON bruto</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
              {props.state.raw}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
