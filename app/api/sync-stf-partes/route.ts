import { NextRequest, NextResponse } from "next/server";
import { syncStfPartes } from "@/src/lib/stf-sync";

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Sync STF partes via Qlik WebSocket.
 * GET + Authorization: Bearer CRON_SECRET
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
    const result = await syncStfPartes();

    return NextResponse.json({
      success: result.errors === 0,
      ...result,
    });
  } catch (error) {
    console.error("[/api/sync-stf-partes]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar partes STF.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
