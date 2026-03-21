import { NextRequest, NextResponse } from "next/server";
import { syncStjDecisionsIncremental } from "@/src/lib/stj-sync";
import { syncStjDecisoesDj } from "@/src/lib/stj-dj-sync";
import { syncStjPrecedentes } from "@/src/lib/stj-precedentes-sync";
import { syncStjDistribuicao } from "@/src/lib/stj-distribuicao-sync";
import { sleep, STJ_INTER_RESOURCE_DELAY_MS } from "@/src/lib/stj-fetch";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Cron (Vercel): sync incremental dos espelhos + cargas completas DJ, precedentes e distribuição.
 * GET + Authorization: Bearer CRON_SECRET
 *
 * Agendamento típico em vercel.json: `0 9 * * *` (UTC) ≈ 06:00 America/Sao_Paulo.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron-sync-stj-datasets] CRON_SECRET is not set");
    return NextResponse.json(
      { success: false, error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const started = Date.now();
  const steps: Record<string, unknown> = {};

  try {
    const espelhos = await syncStjDecisionsIncremental(2);
    steps.espelhos = espelhos;

    await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    const dj = await syncStjDecisoesDj();
    steps.dj = dj;

    await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    const precedentes = await syncStjPrecedentes();
    steps.precedentes = precedentes;

    await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    const distribuicao = await syncStjDistribuicao();
    steps.distribuicao = distribuicao;

    const ok =
      (espelhos.failed?.length ?? 0) === 0 &&
      dj.success !== false &&
      precedentes.success !== false &&
      distribuicao.success !== false;

    return NextResponse.json({
      success: ok,
      durationMs: Date.now() - started,
      steps,
    });
  } catch (error) {
    console.error("[/api/cron-sync-stj-datasets]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar datasets STJ.";
    return NextResponse.json(
      { success: false, error: message, durationMs: Date.now() - started, steps },
      { status: 500 },
    );
  }
}
