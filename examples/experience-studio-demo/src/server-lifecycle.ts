import {
  createStudioLifecycleService,
  type StudioLifecycleService,
  type StudioLifecycleStore,
} from "@vira-enterprise-genui/studio-lifecycle";
import { actionAdapter, bindingSourceCatalog, componentCatalog } from "./catalog.js";

export const DEMO_STUDIO_WORKSPACE_ID = "demo.local" as const;

export function createDemoStudioLifecycleService(store: StudioLifecycleStore): StudioLifecycleService {
  return createStudioLifecycleService({
    store,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    nowUnixMs: Date.now,
  });
}
