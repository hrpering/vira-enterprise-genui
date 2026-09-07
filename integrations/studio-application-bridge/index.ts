import { createActionAdapterContract } from "../../packages/adapter-sdk/src/index.js";
import {
  parseViraApplicationPackageV2,
  type ViraApplicationCommercialMetadataV2,
  type ViraApplicationDistributionMetadata,
  type ViraApplicationExactReference,
  type ViraApplicationHostCompatibility,
  type ViraApplicationPackageV2,
  type ViraApplicationPublisher,
  type ViraApplicationTriggerDeclaration,
} from "../../packages/application-package/src/index.js";
import {
  parseExperiencePackManifest,
  type ExperiencePackManifest,
} from "../../packages/experience-packs/src/index.js";
import type { StudioPublication } from "../../packages/studio-compiler/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";

export const STUDIO_APPLICATION_BRIDGE_VERSION = "1" as const;

export type StudioApplicationBridgeFailureCode =
  | "INVALID_BRIDGE_INPUT"
  | "STUDIO_PUBLICATION_REJECTED"
  | "ACTION_ADAPTER_REJECTED"
  | "APPLICATION_PACKAGE_REJECTED"
  | "STUDIO_ACTION_REFERENCE_MISSING"
  | "CRYPTO_UNAVAILABLE"
  | "EXPERIENCE_PACK_REJECTED";

export interface StudioApplicationBridgeIssue {
  readonly code: StudioApplicationBridgeFailureCode;
  readonly path: string;
  readonly message: string;
  readonly sourceCode?: string;
}

export interface StudioApplicationBridgeStudioInput {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
}

export interface StudioApplicationBridgeApplicationInput {
  readonly id: string;
  readonly version: string;
  readonly packId: string;
  readonly publicationArtifactId: string;
  readonly publisher: ViraApplicationPublisher;
  readonly capabilities: readonly ViraApplicationExactReference[];
  readonly contextTypes: readonly ViraApplicationExactReference[];
  readonly actions: readonly ViraApplicationExactReference[];
  readonly flows: readonly ViraApplicationExactReference[];
  readonly brandRef: ViraApplicationExactReference | null;
  readonly governanceRequirements: readonly ViraApplicationExactReference[];
  readonly hostCompatibility: ViraApplicationHostCompatibility;
  readonly protocolProjections: readonly ViraApplicationExactReference[];
  readonly triggers: readonly ViraApplicationTriggerDeclaration[];
  readonly distribution: ViraApplicationDistributionMetadata;
  readonly commercial: ViraApplicationCommercialMetadataV2;
}

export interface StudioApplicationBridgeInput {
  readonly studio: StudioApplicationBridgeStudioInput;
  readonly application: StudioApplicationBridgeApplicationInput;
}

export interface StudioApplicationPublicationArtifact {
  readonly id: string;
  readonly role: "studio-publication";
  readonly mediaType: "application/json";
  readonly bytes: string;
  readonly digest: string;
  readonly size: number;
}

export interface StudioApplicationBridgeValue {
  readonly version: typeof STUDIO_APPLICATION_BRIDGE_VERSION;
  readonly publication: StudioPublication;
  readonly publicationArtifact: StudioApplicationPublicationArtifact;
  readonly experiencePack: ExperiencePackManifest;
  readonly application: ViraApplicationPackageV2;
}

export type StudioApplicationBridgeResult =
  | { readonly ok: true; readonly value: StudioApplicationBridgeValue }
  | { readonly ok: false; readonly issue: StudioApplicationBridgeIssue };

type PlainRecord = Readonly<Record<string, unknown>>;

type Failure = { readonly ok: false; readonly issue: StudioApplicationBridgeIssue };

const TOP_LEVEL_FIELDS = Object.freeze(["studio", "application"] as const);
const STUDIO_FIELDS = Object.freeze([
  "document",
  "componentCatalog",
  "bindingSourceCatalog",
  "actionAdapter",
] as const);
const APPLICATION_FIELDS = Object.freeze([
  "id",
  "version",
  "packId",
  "publicationArtifactId",
  "publisher",
  "capabilities",
  "contextTypes",
  "actions",
  "flows",
  "brandRef",
  "governanceRequirements",
  "hostCompatibility",
  "protocolProjections",
  "triggers",
  "distribution",
  "commercial",
] as const);

function failure(
  code: StudioApplicationBridgeFailureCode,
  path: string,
  message: string,
  sourceCode?: string,
): Failure {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(sourceCode === undefined ? {} : { sourceCode }),
    }),
  };
}

function plainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor);
}

function validateExactShape(
  value: unknown,
  path: string,
  fields: readonly string[],
): Failure | undefined {
  if (!plainRecord(value)) {
    return failure("INVALID_BRIDGE_INPUT", path, `${path} must be a plain own-data object`);
  }
  const allowed = new Set(fields);
  const unknown = Object.keys(value).sort().find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    return failure("INVALID_BRIDGE_INPUT", `${path}.${unknown}`, `unknown bridge field: ${unknown}`);
  }
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) {
    return failure("INVALID_BRIDGE_INPUT", `${path}.${missing}`, `missing bridge field: ${missing}`);
  }
  return undefined;
}

function nestedPath(base: string, sourcePath: string): string {
  return sourcePath === "$" ? base : `${base}${sourcePath.slice(1)}`;
}

async function sha256Artifact(bytes: string): Promise<
  | { readonly digest: string; readonly size: number }
  | undefined
> {
  const encoded = new TextEncoder().encode(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return undefined;
  try {
    const digest = new Uint8Array(await subtle.digest("SHA-256", encoded));
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return Object.freeze({ digest: `sha256:${hex}`, size: encoded.byteLength });
  } catch {
    return undefined;
  }
}

export async function prepareStudioApplicationPackageV2(
  input: StudioApplicationBridgeInput,
): Promise<StudioApplicationBridgeResult> {
  const topLevelShape = validateExactShape(input, "$", TOP_LEVEL_FIELDS);
  if (topLevelShape !== undefined) return topLevelShape;
  const studioShape = validateExactShape(input.studio, "$.studio", STUDIO_FIELDS);
  if (studioShape !== undefined) return studioShape;
  const applicationShape = validateExactShape(input.application, "$.application", APPLICATION_FIELDS);
  if (applicationShape !== undefined) return applicationShape;

  const publication = prepareStudioPublication(input.studio);
  if (!publication.ok) {
    return failure(
      "STUDIO_PUBLICATION_REJECTED",
      nestedPath("$.studio", publication.issue.path),
      publication.issue.message,
      publication.issue.code,
    );
  }

  const actionAdapter = createActionAdapterContract(input.studio.actionAdapter);
  if (!actionAdapter.ok) {
    return failure(
      "ACTION_ADAPTER_REJECTED",
      nestedPath("$.studio.actionAdapter", actionAdapter.issue.path),
      actionAdapter.issue.message,
      actionAdapter.issue.code,
    );
  }

  const applicationCandidate = {
    schemaVersion: "2",
    identity: { id: input.application.id },
    version: input.application.version,
    publisher: input.application.publisher,
    experiences: [{
      id: publication.value.id,
      packId: input.application.packId,
      packVersion: input.application.version,
      entrypoint: input.application.publicationArtifactId,
    }],
    capabilities: input.application.capabilities,
    contextTypes: input.application.contextTypes,
    actions: input.application.actions,
    flows: input.application.flows,
    brandRef: input.application.brandRef,
    governanceRequirements: input.application.governanceRequirements,
    hostCompatibility: input.application.hostCompatibility,
    protocolProjections: input.application.protocolProjections,
    triggers: input.application.triggers,
    distribution: input.application.distribution,
    commercial: input.application.commercial,
  } as const;
  const application = parseViraApplicationPackageV2(applicationCandidate);
  if (!application.ok) {
    return failure(
      "APPLICATION_PACKAGE_REJECTED",
      nestedPath("$.application", application.issue.path),
      application.issue.message,
      application.issue.code,
    );
  }

  for (const actionEvent of publication.value.manifest.actionEvents) {
    const mapping = actionAdapter.value.mappings.find((candidate) => candidate.event === actionEvent);
    if (mapping === undefined) {
      return failure(
        "ACTION_ADAPTER_REJECTED",
        "$.studio.actionAdapter.mappings",
        `validated Studio action event ${actionEvent} has no canonical Action Adapter mapping`,
        "UNMAPPED_EVENT",
      );
    }
    if (!application.value.actions.some((reference) => reference.id === mapping.actionType)) {
      return failure(
        "STUDIO_ACTION_REFERENCE_MISSING",
        "$.application.actions",
        `Studio action event ${actionEvent} maps to ${mapping.actionType}, but the Application does not declare an exact versioned Action reference`,
      );
    }
  }

  const bytes = JSON.stringify(publication.value);
  const digest = await sha256Artifact(bytes);
  if (digest === undefined) {
    return failure(
      "CRYPTO_UNAVAILABLE",
      "$.publicationArtifact.digest",
      "SHA-256 is unavailable; an exact Studio publication artifact cannot be created",
    );
  }

  const experience = application.value.experiences[0];
  if (experience === undefined) {
    return failure(
      "APPLICATION_PACKAGE_REJECTED",
      "$.application.experiences",
      "canonical Application unexpectedly contains no Studio Experience reference",
    );
  }
  const publicationArtifact = Object.freeze({
    id: experience.entrypoint,
    role: "studio-publication" as const,
    mediaType: "application/json" as const,
    bytes,
    digest: digest.digest,
    size: digest.size,
  });

  const distribution = application.value.distribution;
  const compatibility = application.value.hostCompatibility;
  const experiencePack = parseExperiencePackManifest({
    schemaVersion: "1",
    id: experience.packId,
    version: experience.packVersion,
    publisher: application.value.publisher,
    metadata: {
      name: distribution.name,
      ...(distribution.description === undefined ? {} : { description: distribution.description }),
      tags: distribution.tags,
    },
    compatibility: {
      minViraVersion: compatibility.minViraVersion,
      ...(compatibility.maxViraVersion === undefined ? {} : { maxViraVersion: compatibility.maxViraVersion }),
    },
    entrypoints: [publicationArtifact.id],
    artifacts: [{
      id: publicationArtifact.id,
      role: publicationArtifact.role,
      mediaType: publicationArtifact.mediaType,
      digest: publicationArtifact.digest,
      size: publicationArtifact.size,
    }],
  });
  if (!experiencePack.ok) {
    return failure(
      "EXPERIENCE_PACK_REJECTED",
      nestedPath("$.experiencePack", experiencePack.issue.path),
      experiencePack.issue.message,
      experiencePack.issue.code,
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      version: STUDIO_APPLICATION_BRIDGE_VERSION,
      publication: publication.value,
      publicationArtifact,
      experiencePack: experiencePack.value,
      application: application.value,
    }),
  };
}
