import { NextRequest, NextResponse } from 'next/server';
import { runNormalizationPipeline } from '@/src/lib/judx-normalizer';
import type { PipelineMode } from '@/src/lib/judx-normalizer';
import { COURT_REGISTRY, resolveCourtFromSource } from '@/src/lib/judx-normalizer/shared/court-registry';

export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[/api/normalize-judx] CRON_SECRET is not set');
    return NextResponse.json(
      { success: false, error: 'Server misconfiguration' },
      { status: 500 },
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return unauthorized();
  }

  try {
    const url = new URL(request.url);
    const source = url.searchParams.get('source') as
      | 'stj_decisions'
      | 'stj_decisoes_dj'
      | 'all'
      | null;

    // Validate source against Court Registry before proceeding
    const resolvedSource = source ?? 'all';
    if (resolvedSource !== 'all') {
      const courtDef = resolveCourtFromSource(resolvedSource);
      if (!courtDef) {
        const validSources = Object.values(COURT_REGISTRY).flatMap(c => c.allowedSources);
        return NextResponse.json(
          { success: false, error: `Fonte '${resolvedSource}' desconhecida. Fontes válidas: ${validSources.join(', ')}` },
          { status: 400 },
        );
      }
    }

    const limitParam = url.searchParams.get('limit');
    const dryRunParam = url.searchParams.get('dryRun');
    // mode: 'core' | 'events' | 'patterns' | 'advanced' — resolução progressiva
    const modeParam = url.searchParams.get('mode') as PipelineMode | null;
    const validModes: PipelineMode[] = ['core', 'events', 'patterns', 'advanced'];
    const mode: PipelineMode = modeParam && validModes.includes(modeParam) ? modeParam : 'core';

    const result = await runNormalizationPipeline({
      source: resolvedSource,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      dryRun: dryRunParam === 'true',
      mode,
    });

    return NextResponse.json({
      success: true,
      processed: result.processed,
      upserted: result.upserted,
      errors: result.errors,
      inferences: result.inferences,
    });
  } catch (error) {
    console.error('[/api/normalize-judx]', error);
    const message =
      error instanceof Error ? error.message : 'Falha ao executar pipeline de normalização.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
