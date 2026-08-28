import { describe, expect, it } from "vitest";
import {
  BRAND_TOKEN_ROLES,
  createBrandProfile,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function profile() {
  return {
    version: "1",
    id: "acme.enterprise",
    displayName: "Acme Enterprise",
    tokenRefs: {
      accent: "acme.color.accent",
      surface: "acme.color.surface",
      text: "acme.color.text",
      "body-font": "acme.typography.body",
      "control-radius": "acme.radius.control",
    },
  };
}

describe("adapter-sdk brand profile", () => {
  it("normalizes semantic brand identity and token references", () => {
    const result = createBrandProfile(profile());
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        id: "acme.enterprise",
        displayName: "Acme Enterprise",
        tokenRefs: { accent: "acme.color.accent" },
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.tokenRefs)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("keeps the canonical token role catalog immutable", () => {
    expect(Object.isFrozen(BRAND_TOKEN_ROLES)).toBe(true);
    expect(BRAND_TOKEN_ROLES).toContain("accent");
    expect(BRAND_TOKEN_ROLES).toContain("heading-font");
  });

  it("rejects raw CSS values, CSS keywords, and URLs instead of treating them as semantic tokens", () => {
    for (const reference of ["red", "serif", "inherit", "transparent", "#4f46e5", "16px", "rgb(0,0,0)", "https://example.com/theme.css", "var(--brand)"]) {
      const input = profile();
      input.tokenRefs.accent = reference;
      expect(createBrandProfile(input)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_TOKEN_REFERENCE", path: "$.tokenRefs.accent" },
      });
    }
  });

  it("rejects unknown style roles instead of accepting an arbitrary token bag", () => {
    expect(createBrandProfile({
      ...profile(),
      tokenRefs: { ...profile().tokenRefs, shadow: "acme.shadow.card" },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_TOKEN_ROLE", path: "$.tokenRefs.shadow" },
    });
  });

  it("reuses semantic namespace grammar for brand identity", () => {
    expect(createBrandProfile({ ...profile(), id: "Acme Brand" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ID", path: "$.id" },
    });
  });

  it("rejects style/component/runtime fields on the profile root", () => {
    for (const field of ["css", "stylesheet", "logoUrl", "component", "runtimeState", "endpoint"]) {
      expect(createBrandProfile({ ...profile(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("clones caller-owned token data and rejects accessor-backed fields without running getters", () => {
    const input = profile();
    const result = createBrandProfile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.tokenRefs.accent = "acme.color.changed";
    expect(result.value.tokenRefs.accent).toBe("acme.color.accent");

    let calls = 0;
    const accessor: Record<string, unknown> = { version: "1", id: "acme.enterprise", displayName: "Acme Enterprise" };
    Object.defineProperty(accessor, "tokenRefs", {
      enumerable: true,
      get() {
        calls += 1;
        return {};
      },
    });
    expect(createBrandProfile(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.tokenRefs" } });
    expect(calls).toBe(0);
  });
});
