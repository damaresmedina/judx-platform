import { NextRequest, NextResponse } from "next/server";
import { syncStfDecisoes } from "@/src/lib/stf-sync";

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Sync STF decisões via Qlik WebSocket.
 * GET + Authorization: Bearer CRON_SECRET
 * Query params:
 *   year — filtra por ano da decisão (ex: "2024") para carga incremental
 */
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
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? undefined;

    const result = await syncStfDecisoes(year);

    return NextResponse.json({
      success: result.errors === 0,
      ...result,
    });
  } catch (error) {
    console.error("[/api/sync-stf-decisoes]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar decisões STF.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
