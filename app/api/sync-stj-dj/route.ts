import { NextResponse } from "next/server";
import { syncStjDecisoesDj } from "@/src/lib/stj-dj-sync";

export async function POST() {
  try {
    const result = await syncStjDecisoesDj();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/sync-stj-dj]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar DJ STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
