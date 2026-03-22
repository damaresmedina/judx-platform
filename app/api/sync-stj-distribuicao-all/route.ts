import { NextResponse } from "next/server";
import { syncStjDistribuicaoAll } from "@/src/lib/stj-distribuicao-sync";

/** Pode precisar de plano Pro / limite alto: processa todos os arquivos em uma única invocação. */
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncStjDistribuicaoAll();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/sync-stj-distribuicao-all]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar distribuição STJ (lote completo).";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
