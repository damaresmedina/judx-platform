import { NextResponse } from "next/server";
import { syncStjDistribuicao } from "@/src/lib/stj-distribuicao-sync";

export async function POST() {
  try {
    const result = await syncStjDistribuicao();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/sync-stj-distribuicao]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar distribuição STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
