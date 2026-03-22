import { NextRequest, NextResponse } from "next/server";
import { syncStjDistribuicao } from "@/src/lib/stj-distribuicao-sync";

/** Uma ata por invocação; ajuste no plano Vercel se algum JSON for muito pesado. */
export const maxDuration = 120;

function parseOffset(request: NextRequest): number {
  const q = request.nextUrl.searchParams.get("offset");
  if (q !== null && q !== "") {
    const n = Number(q);
    if (!Number.isNaN(n) && Number.isFinite(n)) {
      return Math.trunc(n);
    }
  }
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    let offset = parseOffset(request);
    const raw = await request.text();
    if (raw.trim()) {
      try {
        const body = JSON.parse(raw) as unknown;
        if (body && typeof body === "object" && "offset" in body) {
          const o = (body as { offset?: unknown }).offset;
          if (typeof o === "number" && Number.isFinite(o)) {
            offset = Math.trunc(o);
          } else if (typeof o === "string" && o.trim() !== "") {
            const n = Number(o);
            if (!Number.isNaN(n) && Number.isFinite(n)) offset = Math.trunc(n);
          }
        }
      } catch {
        // corpo não-JSON: mantém offset da query
      }
    }

    const result = await syncStjDistribuicao({ offset });
    if (result.invalidOffset) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/sync-stj-distribuicao]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar distribuição STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
