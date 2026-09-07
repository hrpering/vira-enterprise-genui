import { describe, expect, it } from "vitest";
import rootHandler, { handleViraWebBffRequest as rootHandle } from "../../api/bff.js";
import appHandler, { handleViraWebBffRequest as appHandle } from "../../apps/vira-web/api/bff.js";

describe("PROD-17 Vercel BFF project-root mount", () => {
  it("exposes the canonical same-origin BFF through the Vercel project-root api surface", () => {
    expect(rootHandler).toBe(appHandler);
    expect(rootHandle).toBe(appHandle);
    expect(typeof rootHandler.fetch).toBe("function");
  });
});
