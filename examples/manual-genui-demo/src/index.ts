import {
  buildStudioExperience,
  validateStudioExperience,
} from "@vira-enterprise-genui/studio-authoring";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
} from "../../experience-studio-demo/src/catalog-v4.js";
import { createGoldenAirlineExperience } from "../../experience-studio-demo/src/golden-airline-experience.js";

const authored = validateStudioExperience(createGoldenAirlineExperience());
if (!authored.ok) throw new Error(authored.issue.message);

export const manualGoldenAirlineDocument = authored.value;

export function buildManualGoldenAirlinePublication() {
  return buildStudioExperience({
    document: manualGoldenAirlineDocument,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
  });
}
