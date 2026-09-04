import {
  VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS,
  VIRA_COMMERCIAL_METERING_SCHEMA_VERSION,
  type ViraCommercialMeteringIssue,
  type ViraCommercialUsageBatch,
  type ViraCommercialUsageLedger,
  type ViraCommercialUsageLedgerResult,
  type ViraCommercialUsageRecord,
} from "./types.js";
import { parseViraCommercialUsageBatch } from "./metering.js";

function issue(code: ViraCommercialMeteringIssue["code"], path: string, message: string): ViraCommercialMeteringIssue {
  return Object.freeze({ code, path, message });
}

function ordered(records: readonly ViraCommercialUsageRecord[]): readonly ViraCommercialUsageRecord[] {
  return Object.freeze(records.slice().sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) return left.occurredAt < right.occurredAt ? -1 : 1;
    if (left.usageId === right.usageId) return 0;
    return left.usageId < right.usageId ? -1 : 1;
  }));
}

export function createViraCommercialUsageLedger(
  initialInput: unknown = { schemaVersion: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION, records: [] },
): ViraCommercialUsageLedgerResult<ViraCommercialUsageLedger> {
  const initial = parseViraCommercialUsageBatch(initialInput);
  if (!initial.ok) return initial;

  const records = initial.value.records.slice();
  const usageIds = new Set(records.map((record) => record.usageId));

  const ledger: ViraCommercialUsageLedger = {
    version: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION,
    append(input) {
      if (records.length >= VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS) {
        return {
          ok: false,
          issue: issue(
            "USAGE_LIMIT_EXCEEDED",
            "$.records",
            `usage record count exceeds ${VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS}`,
          ),
        };
      }
      const parsed = parseViraCommercialUsageBatch({
        schemaVersion: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION,
        records: [input],
      });
      if (!parsed.ok) return parsed;
      const record = parsed.value.records[0]!;
      if (usageIds.has(record.usageId)) {
        return {
          ok: false,
          issue: issue("DUPLICATE_USAGE_ID", "$.usageId", "usageId was already recorded in this commercial usage ledger"),
        };
      }
      usageIds.add(record.usageId);
      records.push(record);
      return { ok: true, value: record };
    },
    snapshot() {
      const snapshot: ViraCommercialUsageBatch = Object.freeze({
        schemaVersion: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION,
        records: ordered(records),
      });
      return snapshot;
    },
  };

  return { ok: true, value: Object.freeze(ledger) };
}
