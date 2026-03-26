import { NextRequest, NextResponse } from "next/server";
import { syncStfIncidente, syncStfIncidentesBatch } from "@/src/lib/stf-sync";

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Sync STF incidente — HTML bruto das 8 abas do portal.
 * GET + Authorization: Bearer CRON_SECRET
 * Query params:
 *   incidente — ID do incidente (obrigatório, ou comma-separated para batch)
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
    const incidenteParam = url.searchParams.get("incidente");

    if (!incidenteParam) {
      return NextResponse.json(
        { success: false, error: "Query param 'incidente' é obrigatório (número ou lista separada por vírgula)" },
        { status: 400 },
      );
    }

    const ids = incidenteParam.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum incidente válido" }, { status: 400 });
    }

    if (ids.length === 1) {
      const result = await syncStfIncidente(ids[0]);
      return NextResponse.json({ success: result.abasFailed.length === 0, ...result });
    }

    const results = await syncStfIncidentesBatch(ids);
    const allOk = results.every((r) => r.abasFailed.length === 0);
    return NextResponse.json({ success: allOk, total: results.length, results });
  } catch (error) {
    console.error("[/api/sync-stf-incidente]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar incidente STF.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
