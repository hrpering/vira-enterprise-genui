#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requirements = Object.freeze([
  {
    id: "authenticated-application-source",
    file: "packages/application-federation/src/source-trust.ts",
    tokens: ["authenticateViraApplicationFederationSourceV2", "KEY_MISMATCH", "TRUST_REVOKED", "SIGNATURE_INVALID"],
  },
  {
    id: "bounded-network-transport",
    file: "packages/application-federation/src/transport.ts",
    tokens: ["validateViraApplicationFederationTransport", "CACHE_VALIDATOR_MISMATCH", "ETAG_MISMATCH", "DIGEST_MISMATCH"],
  },
  {
    id: "explicit-provider-routing",
    file: "packages/capability-supply/src/routing.ts",
    tokens: ["planViraCapabilitySupplyRoute", "advanceViraCapabilitySupplyRoute", "PROVIDER_TRUST_MISMATCH", "FAILOVER_REASON_NOT_ALLOWED"],
  },
  {
    id: "network-protocol-conformance",
    file: "packages/protocol-gateway/src/network-conformance.ts",
    tokens: ["evaluateViraNetworkProtocolConformance", "PROTOCOL_FAMILY_MISMATCH", "action-boundary-required", "applicationProjectionRequired"],
  },
  {
    id: "application-projection-proof",
    file: "packages/application-protocol-projection/src/v2-validate.ts",
    tokens: ["parseViraApplicationProtocolProjectionV2", "parseViraApplicationProtocolProjection"],
  },
]);

function fail(message, detail = {}) {
  process.stderr.write(`${JSON.stringify({
    version: "1",
    gate: "prod19-provisional",
    status: "INCOMPLETE",
    releaseAuthority: "forbidden",
    closureEligible: false,
    message,
    ...detail,
  }, null, 2)}\n`);
  process.exit(1);
}

const verified = [];
for (const requirement of requirements) {
  let source;
  try {
    source = readFileSync(path.join(root, requirement.file), "utf8");
  } catch {
    fail("required PROD-19 repository evidence is missing", { requirement: requirement.id, file: requirement.file });
  }
  const missingTokens = requirement.tokens.filter((token) => !source.includes(token));
  if (missingTokens.length > 0) {
    fail("required PROD-19 repository evidence drifted", {
      requirement: requirement.id,
      file: requirement.file,
      missingTokens,
    });
  }
  verified.push(requirement.id);
}

for (const file of [
  "docs/production/PROD19_APPLICATION_SOURCE_TRUST.md",
  "docs/production/PROD19_BOUNDED_FEDERATION_TRANSPORT.md",
  "docs/production/PROD19_PROVIDER_ROUTING_FAILOVER.md",
  "docs/production/PROD19_NETWORK_PROTOCOL_CONFORMANCE.md",
]) {
  let source;
  try {
    source = readFileSync(path.join(root, file), "utf8");
  } catch {
    fail("required PROD-19 documentation evidence is missing", { file });
  }
  if (!/provisional/i.test(source) || /PROD-19 PRODUCTION READY|VIRA FULL PLATFORM RC/.test(source)) {
    fail("PROD-19 documentation release semantics drifted", { file });
  }
}

process.stdout.write(`${JSON.stringify({
  version: "1",
  gate: "prod19-provisional",
  status: "PROVISIONAL_CODE_COMPLETE",
  releaseAuthority: "forbidden",
  verified: Object.freeze(verified),
  liveEvidenceDeferred: Object.freeze([
    "public-network-live-endpoints",
    "cdn-cache-production-behavior",
    "publisher-key-rotation-revocation-live",
    "provider-slo-region-commercial-evidence",
    "provider-live-failover-drill",
    "external-protocol-interoperability",
    "prod17-prod18-live-release-authority",
  ]),
  closureEligible: true,
}, null, 2)}\n`);
