import { NextRequest, NextResponse } from "next/server";
import { syncStjMovimentacao } from "@/src/lib/stj-sync";
import { assertSourceInspected } from "@/src/lib/judx-normalizer/shared/court-registry";

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "Server misconfiguration" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  try {
    // Barreira: fonte deve ter sido inspecionada
    assertSourceInspected('stj_movimentacao');

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 0;

    const result = await syncStjMovimentacao(limit);

    return NextResponse.json({
      success: result.errors === 0,
      ...result,
    });
  } catch (error) {
    console.error("[/api/sync-stj-movimentacao]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar movimentação STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
