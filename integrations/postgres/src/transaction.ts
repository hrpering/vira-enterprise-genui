import {
  createViraEnterpriseContext,
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
} from "../../../packages/enterprise-context/src/index.js";

export interface PostgresQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount?: number | null;
}

export interface PostgresClientLike {
  readonly query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<PostgresQueryResult<Row>>;
  readonly release: () => void;
}

export interface PostgresPoolLike {
  readonly connect: () => Promise<PostgresClientLike>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalizeEnterpriseScope(input: unknown): ViraEnterpriseScope {
  if (!isRecord(input)) throw new TypeError("PostgreSQL scope must be a canonical enterprise scope");
  const keys = Object.keys(input).sort();
  const expected = ["environment", "organizationId", "projectId", "version"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("PostgreSQL scope has an invalid shape");
  }
  if (input.version !== VIRA_ENTERPRISE_CONTEXT_VERSION) {
    throw new TypeError("PostgreSQL scope version is invalid");
  }

  const created = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!created.ok) throw new TypeError("PostgreSQL scope is not a valid enterprise context scope");

  const scope = created.value.scope(input.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) throw new TypeError("PostgreSQL scope environment is invalid");
  return scope.value;
}

export async function withTenantTransaction<T>(
  pool: PostgresPoolLike,
  scopeInput: unknown,
  work: (client: PostgresClientLike, scope: ViraEnterpriseScope) => Promise<T>,
): Promise<T> {
  const scope = canonicalizeEnterpriseScope(scopeInput);
  const client = await pool.connect();
  let began = false;

  try {
    await client.query("BEGIN");
    began = true;
    await client.query(
      "SELECT set_config('vira.organization_id', $1, true), set_config('vira.project_id', $2, true), set_config('vira.environment', $3, true)",
      [scope.organizationId, scope.projectId, scope.environment],
    );
    await client.query("SELECT vira.require_scope()");
    const result = await work(client, scope);
    await client.query("COMMIT");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "PostgreSQL tenant transaction and rollback both failed",
          { cause: rollbackError },
        );
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
