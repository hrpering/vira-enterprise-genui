export {
  VIRA_OIDC_MAX_JWKS_BYTES,
  VIRA_OIDC_MAX_JWKS_KEYS,
  VIRA_OIDC_MAX_METADATA_BYTES,
  fetchOidcDiscoveryAndJwks,
} from "./discovery.js";
export type {
  ViraOidcDiscoveryConfiguration,
  ViraOidcDiscoveryResult,
  ViraOidcDiscoveryValue,
} from "./discovery.js";
export { VIRA_OIDC_ALLOWED_ALGORITHMS, verifyOidcJwt } from "./verify.js";
export type {
  ViraOidcAlgorithm,
  ViraOidcIssuerConfiguration,
  ViraOidcJsonWebKey,
  ViraOidcVerificationIssue,
  ViraOidcVerificationIssueCode,
  ViraOidcVerificationResult,
} from "./verify.js";
