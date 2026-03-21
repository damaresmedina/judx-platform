import { NextRequest, NextResponse } from "next/server";
import { syncStjDecisionsIncremental } from "@/src/lib/stj-sync";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron-sync-stj] CRON_SECRET is not set");
    return NextResponse.json(
      { success: false, error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return unauthorized();
  }

  try {
    const {
      inserted,
      datasetsSucceeded,
      failed,
      jsonResourcesProcessed,
      csvResourcesProcessed,
      zipFallbacksUsed,
    } = await syncStjDecisionsIncremental(2);
    return NextResponse.json({
      success: true,
      inserted,
      datasetsSucceeded,
      failed,
      jsonResourcesProcessed,
      csvResourcesProcessed,
      zipFallbacksUsed,
    });
  } catch (error) {
    console.error("[/api/cron-sync-stj]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar STJ (incremental).";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
