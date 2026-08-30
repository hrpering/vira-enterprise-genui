import { bindingSourceCatalog } from "./catalog.js";
import { MOCK_BINDING_SOURCES } from "./mock-bindings.js";

(bindingSourceCatalog as unknown as { sources: typeof MOCK_BINDING_SOURCES }).sources = MOCK_BINDING_SOURCES;

if (/^\/live\/[^/]+$/.test(window.location.pathname)) {
  await import("./live-data-app.js");
} else {
  await import("./main.js");
}
