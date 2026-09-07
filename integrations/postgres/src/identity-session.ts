import {
  authorizePersistedBrowserSessionHash,
  type ViraAuthorizedBrowserSession,
  type ViraBrowserSecurityResult,
  type ViraBrowserSessionRecord,
} from "../../browser-session/src/index.js";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
  ViraIdentityMembership,
} from "../../../packages/enterprise-context/src/index.js";
import { withTenantTransaction, type PostgresPoolLike } from "./transaction.js";

interface BrowserSessionRow extends Record<string, unknown> {
  readonly session_id_hash: unknown;
  readonly membership_id: unknown;
  readonly membership_revision: unknown;
  readonly session_principal_kind: unknown;
  readonly session_principal_id: unknown;
  readonly session_issued_at: unknown;
  readonly session_expires_at: unknown;
  readonly session_revoked_at: unknown;
  readonly identity_issuer: unknown;
  readonly identity_subject: unknown;
  readonly membership_principal_kind: unknown;
  readonly membership_principal_id: unknown;
  readonly membership_revision_current: unknown;
  readonly membership_active: unknown;
  readonly membership_expires_at: unknown;
}

const sessionHashPattern = /^[0-9a-f]{64}$/;

function fail<T>(code: string, message: string): ViraBrowserSecurityResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function optionalInteger(value: unknown): number | undefined | null {
  if (value === null || value === undefined) return undefined;
  return integer(value) ?? null;
}

function principal(scope: ViraEnterpriseScope, kind: unknown, id: unknown): ViraEnterprisePrincipal | undefined {
  if ((kind !== "user" && kind !== "agent" && kind !== "service") || typeof id !== "string") return undefined;
  return Object.freeze({ version: "1", kind, id, organizationId: scope.organizationId });
}

function mapRow(row: BrowserSessionRow, scope: ViraEnterpriseScope): {
  readonly session: ViraBrowserSessionRecord;
  readonly membership: ViraIdentityMembership;
} | undefined {
  const sessionPrincipal = principal(scope, row.session_principal_kind, row.session_principal_id);
  const membershipPrincipal = principal(scope, row.membership_principal_kind, row.membership_principal_id);
  const sessionRevision = integer(row.membership_revision);
  const membershipRevision = integer(row.membership_revision_current);
  const issuedAt = integer(row.session_issued_at);
  const expiresAt = integer(row.session_expires_at);
  const revokedAt = optionalInteger(row.session_revoked_at);
  const membershipExpiresAt = optionalInteger(row.membership_expires_at);
  if (
    typeof row.session_id_hash !== "string"
    || !sessionHashPattern.test(row.session_id_hash)
    || typeof row.membership_id !== "string"
    || typeof row.identity_issuer !== "string"
    || typeof row.identity_subject !== "string"
    || typeof row.membership_active !== "boolean"
    || !sessionPrincipal
    || !membershipPrincipal
    || sessionRevision === undefined
    || membershipRevision === undefined
    || issuedAt === undefined
    || expiresAt === undefined
    || revokedAt === null
    || membershipExpiresAt === null
  ) return undefined;

  return Object.freeze({
    session: Object.freeze({
      version: "1",
      sessionIdHash: row.session_id_hash,
      principal: sessionPrincipal,
      scope,
      membershipId: row.membership_id,
      membershipRevision: sessionRevision,
      issuedAt,
      expiresAt,
      ...(revokedAt === undefined ? {} : { revokedAt }),
    }),
    membership: Object.freeze({
      version: "1",
      membershipId: row.membership_id,
      identityIssuer: row.identity_issuer,
      identitySubject: row.identity_subject,
      principal: membershipPrincipal,
      scope,
      revision: membershipRevision,
      active: row.membership_active,
      ...(membershipExpiresAt === undefined ? {} : { expiresAt: membershipExpiresAt }),
    }),
  });
}

export async function authorizeBrowserSessionFromPostgres(
  pool: PostgresPoolLike,
  input: unknown,
): Promise<ViraBrowserSecurityResult<ViraAuthorizedBrowserSession>> {
  if (
    !record(input)
    || typeof input.sessionIdHash !== "string"
    || !sessionHashPattern.test(input.sessionIdHash)
    || !record(input.scope)
    || (input.nowEpochSeconds !== undefined
      && (typeof input.nowEpochSeconds !== "number" || !Number.isSafeInteger(input.nowEpochSeconds) || input.nowEpochSeconds < 0))
  ) return fail("INVALID_SESSION_LOOKUP", "browser session persistence lookup input is invalid");

  try {
    return await withTenantTransaction(pool, input.scope, async (client, scope) => {
      const result = await client.query<BrowserSessionRow>(
        `SELECT
           bs.session_id_hash,
           bs.membership_id,
           bs.membership_revision::text AS membership_revision,
           bs.principal_kind AS session_principal_kind,
           bs.principal_id AS session_principal_id,
           extract(epoch from bs.issued_at)::bigint::text AS session_issued_at,
           extract(epoch from bs.expires_at)::bigint::text AS session_expires_at,
           CASE WHEN bs.revoked_at IS NULL THEN NULL ELSE extract(epoch from bs.revoked_at)::bigint::text END AS session_revoked_at,
           im.identity_issuer,
           im.identity_subject,
           im.principal_kind AS membership_principal_kind,
           im.principal_id AS membership_principal_id,
           im.revision::text AS membership_revision_current,
           im.active AS membership_active,
           CASE WHEN im.expires_at IS NULL THEN NULL ELSE extract(epoch from im.expires_at)::bigint::text END AS membership_expires_at
         FROM vira.browser_session AS bs
         INNER JOIN vira.identity_membership AS im
           ON im.organization_id = bs.organization_id
          AND im.project_id = bs.project_id
          AND im.environment = bs.environment
          AND im.membership_id = bs.membership_id
         WHERE bs.session_id_hash = $1
         LIMIT 2`,
        [input.sessionIdHash],
      );
      if (result.rows.length !== 1) return fail("SESSION_NOT_FOUND", "browser session was not found in the requested scope");
      const mapped = mapRow(result.rows[0]!, scope);
      if (!mapped) return fail("INVALID_SESSION_RECORD", "browser session persistence row is invalid");
      return authorizePersistedBrowserSessionHash({
        sessionIdHash: input.sessionIdHash,
        session: mapped.session,
        membership: mapped.membership,
        nowEpochSeconds: input.nowEpochSeconds,
      });
    });
  } catch {
    return fail("SESSION_LOOKUP_FAILED", "browser session persistence lookup failed closed");
  }
}
