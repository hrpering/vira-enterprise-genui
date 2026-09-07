import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the PROD-14 live PostgreSQL gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");

execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
  cwd: root, env: { ...process.env, VIRA_DATABASE_URL: databaseUrl }, stdio: "inherit",
});

const sql = String.raw`
BEGIN;
SET LOCAL ROLE vira_worker;
SELECT set_config('vira.organization_id', 'prod14-live-org', true);
SELECT set_config('vira.project_id', 'prod14-live-project', true);
SELECT set_config('vira.environment', 'staging', true);
SELECT vira.require_scope();

INSERT INTO vira.commercial_invoice_export (
  organization_id, project_id, environment, export_id, revision, customer_kind, customer_id,
  period_start, period_end, currency, plan_id, plan_version, source_set_digest, content_digest,
  total_amount_nanos, created_at, invoice_export
) VALUES (
  'prod14-live-org','prod14-live-project','staging','export.prod14.live',1,'service','customer.prod14.live',
  '2026-09-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','USD','pricing.prod14','1',repeat('a',64),repeat('b',64),100,
  '2026-10-01T00:00:01.000Z',
  jsonb_build_object(
    'version','1','exportId','export.prod14.live','revision',1,
    'scope',jsonb_build_object('version','1','organizationId','prod14-live-org','projectId','prod14-live-project','environment','staging'),
    'customer',jsonb_build_object('version','1','kind','service','id','customer.prod14.live','organizationId','prod14-live-org'),
    'periodStart','2026-09-01T00:00:00.000Z','periodEnd','2026-10-01T00:00:00.000Z','currency','USD',
    'planRef',jsonb_build_object('id','pricing.prod14','versionRef','1'),
    'applicationRefs',jsonb_build_array(jsonb_build_object('id','demo.prod14','version','1.0.0')),
    'sourceSetDigest',repeat('a',64),'usageLines',jsonb_build_array(),'fixedAmountNanos',100,
    'priceLines',jsonb_build_array(),'settlementEvidenceRefs',jsonb_build_array(),'subtotalNanos',100,
    'totalAmountNanos',100,'createdAt','2026-10-01T00:00:01.000Z','contentDigest',repeat('b',64)
  )
);

DO $append_only_invoice$
BEGIN
  BEGIN
    UPDATE vira.commercial_invoice_export SET total_amount_nanos=101 WHERE export_id='export.prod14.live';
    RAISE EXCEPTION 'immutable invoice export UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$append_only_invoice$;

SELECT set_config('vira.organization_id', 'other-org', true);
SELECT set_config('vira.project_id', 'other-project', true);
SELECT vira.require_scope();
DO $invoice_tenant_isolation$
BEGIN
  IF EXISTS (SELECT 1 FROM vira.commercial_invoice_export WHERE export_id='export.prod14.live')
    THEN RAISE EXCEPTION 'cross-tenant invoice export was visible'; END IF;
END
$invoice_tenant_isolation$;
ROLLBACK;
`;

execFileSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"],
});
process.stdout.write("PROD-14 live PostgreSQL invoice export gate passed.\n");
