import { NextRequest, NextResponse } from "next/server";
import { syncStjDecisionsFromFailedUrls } from "@/src/lib/stj-sync";

type Body = { urls?: unknown };

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido no corpo da requisição." },
      { status: 400 },
    );
  }

  const raw = body.urls;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Informe um array não vazio em "urls" com as URLs de download do CKAN que falharam.',
      },
      { status: 400 },
    );
  }

  const urls = raw.filter((u): u is string => typeof u === "string");
  if (urls.length !== raw.length) {
    return NextResponse.json(
      { success: false, error: 'Cada item de "urls" deve ser uma string.' },
      { status: 400 },
    );
  }

  try {
    const {
      inserted,
      results,
      jsonResourcesProcessed,
      csvResourcesProcessed,
      zipFallbacksUsed,
    } = await syncStjDecisionsFromFailedUrls(urls);
    return NextResponse.json({
      success: true,
      inserted,
      results,
      jsonResourcesProcessed,
      csvResourcesProcessed,
      zipFallbacksUsed,
    });
  } catch (error) {
    console.error("[/api/sync-stj-failed]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao reprocessar URLs do STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
