import { getIconsServiceClient } from "./icons-client";

/**
 * Registra uma proposta de padrão novo em ontology_proposals no ICONS.
 * Usado pelo sistema de auto-aprendizagem quando detecta padrões
 * que não existem na taxonomia corrente.
 */
export async function proposePattern(
  type: string,
  payload: Record<string, unknown>,
  confidenceScore: number,
): Promise<void> {
  const client = getIconsServiceClient();
  const { error } = await client.from("ontology_proposals").insert({
    proposal_type: type,
    description: payload.description ?? `Padrão detectado: ${type}`,
    evidence_payload: payload,
    recurrence_count: 1,
    confidence_score: confidenceScore,
    stability_score: null,
    predictive_gain: null,
    compatibility_score: null,
    status: "pending",
  });
  if (error) {
    console.warn("[icons-learn] proposePattern failed:", error.message);
  }
}

/**
 * Incrementa recurrence_count de uma proposta existente ou cria nova.
 * Propostas recorrentes ganham confiança para validação humana.
 */
export async function proposeOrIncrement(
  type: string,
  matchKey: string,
  payload: Record<string, unknown>,
  confidenceScore: number,
): Promise<void> {
  const client = getIconsServiceClient();

  const { data: existing } = await client
    .from("ontology_proposals")
    .select("proposal_id, recurrence_count")
    .eq("proposal_type", type)
    .eq("status", "pending")
    .contains("evidence_payload", { match_key: matchKey })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await client
      .from("ontology_proposals")
      .update({
        recurrence_count: (existing.recurrence_count ?? 0) + 1,
        confidence_score: Math.min(confidenceScore + 0.05, 1),
      })
      .eq("proposal_id", existing.proposal_id);
  } else {
    await proposePattern(type, { ...payload, match_key: matchKey }, confidenceScore);
  }
}
