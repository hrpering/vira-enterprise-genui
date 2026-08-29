import { describe, expect, it } from "vitest";
import {
  AUTHORIZED_CONTENT_SINKS,
  PLAIN_TEXT_MAX_LENGTH,
  authorizeContentSink,
  createPlainTextContent,
} from "../../packages/security/src/index.js";

describe("security plain-text content boundary", () => {
  it("preserves markup-looking content as literal plain text", () => {
    const input = `<script>alert("xss")</script><img src=x onerror=alert(1)> &amp;`;
    const result = createPlainTextContent(input);
    expect(result).toEqual({
      ok: true,
      value: { sink: "plain-text", value: input },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.value).toBe(input);
  });

  it("authorizes only the explicit plain-text sink and fails closed for executable/markup sinks", () => {
    expect(AUTHORIZED_CONTENT_SINKS).toEqual(["plain-text"]);
    expect(authorizeContentSink("plain-text")).toEqual({ ok: true, value: "plain-text" });

    for (const sink of ["html", "innerHTML", "svg", "mathml", "script", "style", "url", "markdown", "unknown", null]) {
      expect(authorizeContentSink(sink)).toMatchObject({
        ok: false,
        issue: { code: "UNSUPPORTED_SINK", path: "$.sink" },
      });
    }
  });

  it("rejects non-string and oversized text without rewriting content", () => {
    expect(createPlainTextContent({ value: "hello" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TEXT", path: "$" },
    });
    expect(createPlainTextContent("x".repeat(PLAIN_TEXT_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(createPlainTextContent("x".repeat(PLAIN_TEXT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      issue: { code: "TEXT_TOO_LONG", path: "$" },
    });
  });
});
