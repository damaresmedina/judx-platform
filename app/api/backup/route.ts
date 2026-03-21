import { NextRequest, NextResponse } from "next/server";
import { runFullBackup } from "@/src/lib/backup";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Cron Vercel (GET + Authorization: Bearer CRON_SECRET). POST é para uso manual (ex.: página de controle).
 * Agendamento típico: `0 6 * * *` (UTC) ≈ 03:00 America/Sao_Paulo.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/backup GET] CRON_SECRET is not set");
    return NextResponse.json(
      { success: false, error: "Server misconfiguration" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }
  try {
    const started = Date.now();
    const result = await runFullBackup();
    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (error) {
    console.error("[/api/backup GET]", error);
    const message = error instanceof Error ? error.message : "Falha no backup.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const started = Date.now();
    const result = await runFullBackup();
    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (error) {
    console.error("[/api/backup POST]", error);
    const message = error instanceof Error ? error.message : "Falha no backup.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
