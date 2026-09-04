import type { ViraCanvasSemantics } from "@vira-enterprise-genui/application-canvas";
import type {
  ViraApplicationActionReference,
  ViraApplicationExactReference,
  ViraApplicationExperienceReference,
} from "@vira-enterprise-genui/application-package";
import {
  generateViraCanvasAiProposal as generateUncheckedViraCanvasAiProposal,
} from "./propose.js";
import type {
  ViraCanvasAiIssue,
  ViraCanvasAiProposalResult,
  ViraCanvasAiProvider,
} from "./types.js";

function exactKey(ref: ViraApplicationExactReference): string {
  return `${ref.id}\u0000${ref.versionRef}`;
}

function experienceKey(ref: ViraApplicationExperienceReference): string {
  return `${ref.id}\u0000${ref.packId}\u0000${ref.packVersion}\u0000${ref.entrypoint}`;
}

function actionKey(ref: ViraApplicationActionReference): string {
  return ref.actionType;
}

function invalid(path: string, message: string): ViraCanvasAiProposalResult {
  const issue: ViraCanvasAiIssue = Object.freeze({ code: "INVALID_CANDIDATE", path, message });
  return { ok: false, issue };
}

function validateCandidateGraphDeclarations(candidate: ViraCanvasSemantics): ViraCanvasAiProposalResult | undefined {
  const application = candidate.application;
  const experiences = new Set(application.experiences.map(experienceKey));
  const capabilities = new Set(application.capabilities.map(exactKey));
  const contexts = new Set(application.contextTypes.map(exactKey));
  const actions = new Set(application.actions.map(actionKey));
  const flows = new Set(application.flows.map(exactKey));

  for (let graphIndex = 0; graphIndex < candidate.graphs.length; graphIndex += 1) {
    const graph = candidate.graphs[graphIndex];
    if (!graph) continue;
    if (!flows.has(`${graph.id}\u0000${graph.version}`)) {
      return invalid(
        `$.candidate.graphs[${graphIndex}]`,
        "candidate ApplicationGraph release must be declared by candidate Application flows",
      );
    }
    for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex += 1) {
      const node = graph.nodes[nodeIndex];
      if (!node) continue;
      const path = `$.candidate.graphs[${graphIndex}].nodes[${nodeIndex}].target`;
      if (node.target.kind === "experience" && !experiences.has(experienceKey(node.target.ref))) {
        return invalid(path, "graph Experience target must be declared by candidate Application experiences");
      }
      if (node.target.kind === "capability" && !capabilities.has(exactKey(node.target.ref))) {
        return invalid(path, "graph Capability target must be declared by candidate Application capabilities");
      }
      if (node.target.kind === "context" && !contexts.has(exactKey(node.target.ref))) {
        return invalid(path, "graph Context target must be declared by candidate Application contextTypes");
      }
      if (node.target.kind === "action" && !actions.has(node.target.actionType)) {
        return invalid(path, "graph Action target must be declared by candidate Application actions");
      }
    }
  }
  return undefined;
}

export async function generateViraCanvasAiProposal(
  input: unknown,
  provider: ViraCanvasAiProvider,
): Promise<ViraCanvasAiProposalResult> {
  const result = await generateUncheckedViraCanvasAiProposal(input, provider);
  if (!result.ok) return result;
  return validateCandidateGraphDeclarations(result.value.candidateSemantics) ?? result;
}
