export type PipelineMode = 'core' | 'events' | 'patterns' | 'advanced';

export const PIPELINE_MODE_LAYERS: Record<PipelineMode, string[]> = {
  core:     ['court', 'organ', 'case', 'decision', 'judge', 'procedural_class', 'subject', 'litigant'],
  events:   ['judgment_regime', 'environment_event', 'environment_inference', 'rapporteur_outcome'],
  patterns: ['latent_signal', 'unknown_pattern', 'collegial_context'],
  advanced: ['decision_line', 'decisional_dna', 'situated_profile', 'emergent_taxonomy'],
};

function modeRank(mode: PipelineMode): number {
  return { core: 0, events: 1, patterns: 2, advanced: 3 }[mode];
}

export function isLayerActive(layer: string, mode: PipelineMode): boolean {
  const active = Object.entries(PIPELINE_MODE_LAYERS)
    .filter(([m]) => modeRank(m as PipelineMode) <= modeRank(mode))
    .flatMap(([, layers]) => layers);
  return active.includes(layer);
}
