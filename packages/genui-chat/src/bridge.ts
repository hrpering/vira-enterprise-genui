import {
  parseViraExperienceMessage,
  type ViraExperienceResolver,
  type ViraResolvedExperience,
} from "@vira-enterprise-genui/genui-resolver";

export type ViraChatBridgeIssueCode =
  | "INVALID_MESSAGE"
  | "INVALID_OPERATION"
  | "INSTANCE_ALREADY_MOUNTED"
  | "INSTANCE_NOT_FOUND"
  | "RESOLUTION_FAILED"
  | "COMMAND_FAILED"
  | "BRIDGE_DISPOSED";

export interface ViraChatBridgeIssue {
  readonly code: ViraChatBridgeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraChatBridgePresentResult =
  | { readonly ok: true; readonly value: ViraResolvedExperience }
  | { readonly ok: false; readonly issue: ViraChatBridgeIssue };

export type ViraChatBridgeCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: ViraChatBridgeIssue };

export type ViraChatBridgeListener = () => void;

export interface ViraChatBridge {
  readonly present: (message: unknown) => Promise<ViraChatBridgePresentResult>;
  readonly command: (message: unknown) => Promise<ViraChatBridgeCommandResult>;
  readonly get: (instanceId: string) => ViraResolvedExperience | undefined;
  readonly subscribe: (listener: ViraChatBridgeListener) => () => void;
  readonly dispose: (instanceId?: string) => void;
}

function issue(code: ViraChatBridgeIssueCode, path: string, message: string): ViraChatBridgeIssue {
  return Object.freeze({ code, path, message });
}

export function createViraChatBridge(resolver: ViraExperienceResolver): ViraChatBridge {
  const mounted = new Map<string, ViraResolvedExperience>();
  const pending = new Set<string>();
  const listeners = new Set<ViraChatBridgeListener>();
  let disposed = false;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* consumer observer */ }
    }
  };

  const bridge: ViraChatBridge = {
    async present(message): Promise<ViraChatBridgePresentResult> {
      if (disposed) return { ok: false, issue: issue("BRIDGE_DISPOSED", "$", "Chat bridge is disposed") };
      const parsed = parseViraExperienceMessage(message);
      if (!parsed.ok) return { ok: false, issue: issue("INVALID_MESSAGE", parsed.issue.path, parsed.issue.message) };
      if (parsed.value.op !== "present") return { ok: false, issue: issue("INVALID_OPERATION", "$.op", "present() requires a present message") };
      const instanceId = parsed.value.instanceId;
      if (mounted.has(instanceId) || pending.has(instanceId)) {
        return { ok: false, issue: issue("INSTANCE_ALREADY_MOUNTED", "$.instanceId", "instanceId is already mounted or resolving") };
      }
      pending.add(instanceId);
      try {
        const result = await resolver.resolvePresent(parsed.value);
        if (!result.ok) return { ok: false, issue: issue("RESOLUTION_FAILED", result.issue.path, result.issue.message) };
        if (disposed) {
          result.value.dispose();
          return { ok: false, issue: issue("BRIDGE_DISPOSED", "$", "Chat bridge was disposed while resolving") };
        }
        mounted.set(instanceId, result.value);
        notify();
        return result;
      } finally {
        pending.delete(instanceId);
      }
    },
    async command(message): Promise<ViraChatBridgeCommandResult> {
      if (disposed) return { ok: false, issue: issue("BRIDGE_DISPOSED", "$", "Chat bridge is disposed") };
      const parsed = parseViraExperienceMessage(message);
      if (!parsed.ok) return { ok: false, issue: issue("INVALID_MESSAGE", parsed.issue.path, parsed.issue.message) };
      if (parsed.value.op !== "command") return { ok: false, issue: issue("INVALID_OPERATION", "$.op", "command() requires a command message") };
      const experience = mounted.get(parsed.value.instanceId);
      if (!experience) return { ok: false, issue: issue("INSTANCE_NOT_FOUND", "$.instanceId", "command target instance is not mounted") };
      const result = await experience.command(parsed.value.command, parsed.value.args);
      return result.ok
        ? { ok: true }
        : { ok: false, issue: issue("COMMAND_FAILED", result.issue.path, result.issue.message) };
    },
    get(instanceId): ViraResolvedExperience | undefined {
      if (disposed) return undefined;
      return mounted.get(instanceId);
    },
    subscribe(listener): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    dispose(instanceId): void {
      if (instanceId !== undefined) {
        const experience = mounted.get(instanceId);
        if (!experience) return;
        mounted.delete(instanceId);
        experience.dispose();
        notify();
        return;
      }
      if (disposed) return;
      disposed = true;
      for (const experience of mounted.values()) experience.dispose();
      mounted.clear();
      pending.clear();
      listeners.clear();
    },
  };
  return Object.freeze(bridge);
}
