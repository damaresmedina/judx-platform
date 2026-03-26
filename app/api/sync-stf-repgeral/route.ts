import { NextRequest, NextResponse } from "next/server";
import { syncStfRepercussaoGeral, syncStfRepercussaoGeralBatch } from "@/src/lib/stf-sync";

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Sync STF repercussão geral — JSON da API.
 * GET + Authorization: Bearer CRON_SECRET
 * Query params:
 *   tema — número do tema (ex: 1)
 *   batch — se "true", busca temas 1 a 1500 em sequência
 *   from/to — range de temas para batch parcial (ex: from=1&to=100)
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
    const temaParam = url.searchParams.get("tema");
    const batchParam = url.searchParams.get("batch");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    // Single tema
    if (temaParam) {
      const tema = parseInt(temaParam, 10);
      if (isNaN(tema)) {
        return NextResponse.json({ success: false, error: "tema deve ser número" }, { status: 400 });
      }
      const result = await syncStfRepercussaoGeral(tema);
      return NextResponse.json({ success: result.ok, ...result });
    }

    // Batch mode
    if (batchParam === "true") {
      const from = fromParam ? parseInt(fromParam, 10) : 1;
      const to = toParam ? parseInt(toParam, 10) : 1500;
      const temas = Array.from({ length: to - from + 1 }, (_, i) => from + i);

      const results = await syncStfRepercussaoGeralBatch(temas);
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;

      return NextResponse.json({
        success: failed === 0,
        total: results.length,
        ok,
        failed,
      });
    }

    return NextResponse.json(
      { success: false, error: "Query param 'tema' ou 'batch=true' é obrigatório" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[/api/sync-stf-repgeral]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar repercussão geral.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
