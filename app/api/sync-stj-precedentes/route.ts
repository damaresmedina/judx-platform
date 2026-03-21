import { NextResponse } from "next/server";
import { syncStjPrecedentes } from "@/src/lib/stj-precedentes-sync";

export async function POST() {
  try {
    const result = await syncStjPrecedentes();
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/sync-stj-precedentes]", error);
    const message = error instanceof Error ? error.message : "Falha ao sincronizar precedentes STJ.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
