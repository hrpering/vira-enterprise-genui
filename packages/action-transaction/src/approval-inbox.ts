import type { ViraFrozenTransactionPlan } from "./types.js";
import {
  VIRA_TRANSACTION_APPROVAL_VERSION,
  createViraTransactionComprehension,
  type ViraTransactionApprovalResult,
  type ViraTransactionComprehension,
} from "./approval.js";

export const VIRA_TRANSACTION_APPROVAL_INBOX_KIND = "transaction-approval" as const;
export const VIRA_TRANSACTION_APPROVAL_INBOX_STATUSES = Object.freeze([
  "awaiting-approval",
  "approved",
  "rejected",
  "expired",
] as const);

export type ViraTransactionApprovalInboxStatus = (typeof VIRA_TRANSACTION_APPROVAL_INBOX_STATUSES)[number];

/**
 * Transaction Approval is deliberately a separate inbox/state surface from
 * generic Human Task handoff. This item is a review projection only; it does
 * not carry a grant, SecretRef, execution reservation or mutable Action input.
 */
export interface ViraTransactionApprovalInboxItem {
  readonly version: typeof VIRA_TRANSACTION_APPROVAL_VERSION;
  readonly kind: typeof VIRA_TRANSACTION_APPROVAL_INBOX_KIND;
  readonly inboxItemId: string;
  readonly status: ViraTransactionApprovalInboxStatus;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly review: ViraTransactionComprehension;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

function safeInboxItemId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/.test(value) && value.trim() === value;
}

export function createViraTransactionApprovalInboxItem(
  frozen: ViraFrozenTransactionPlan,
  inboxItemId: string,
): ViraTransactionApprovalResult<ViraTransactionApprovalInboxItem> {
  if (typeof inboxItemId !== "string" || !safeInboxItemId(inboxItemId)) {
    return {
      ok: false,
      issue: Object.freeze({
        code: "INVALID_INPUT",
        path: "$.inboxItemId",
        message: "transaction approval inbox item id is invalid",
      }),
    };
  }
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) return review;
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_TRANSACTION_APPROVAL_VERSION,
      kind: VIRA_TRANSACTION_APPROVAL_INBOX_KIND,
      inboxItemId,
      status: "awaiting-approval",
      transactionId: review.value.transactionId,
      planDigest: review.value.planDigest,
      planRevision: review.value.planRevision,
      review: review.value,
      createdAtEpochMs: review.value.createdAtEpochMs,
      expiresAtEpochMs: review.value.expiresAtEpochMs,
    }),
  };
}
