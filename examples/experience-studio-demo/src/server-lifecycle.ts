import {
  createStudioLifecycleService,
  type StudioLifecycleService,
  type StudioLifecycleStore,
} from "@vira-enterprise-genui/studio-lifecycle";
import { actionAdapter, componentCatalog } from "./catalog.js";
import { mockBindingSourceCatalog } from "./mock-bindings.js";

export const DEMO_STUDIO_WORKSPACE_ID = "demo.local" as const;

export function createDemoStudioLifecycleService(store: StudioLifecycleStore): StudioLifecycleService {
  return createStudioLifecycleService({
    store,
    componentCatalog,
    bindingSourceCatalog: mockBindingSourceCatalog,
    actionAdapter,
    nowUnixMs: Date.now,
  });
}
