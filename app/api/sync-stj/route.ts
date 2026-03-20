import { NextResponse } from "next/server";
import { syncStjDecisions } from "@/src/lib/stj-sync";

export async function POST() {
  try {
    const { inserted, datasetsSucceeded, failed } = await syncStjDecisions();
    return NextResponse.json({
      success: true,
      inserted,
      datasetsSucceeded,
      failed,
    });
  } catch (error) {
    console.error("[/api/sync-stj]", error);
    const message =
      error instanceof Error ? error.message : "Falha ao sincronizar STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
