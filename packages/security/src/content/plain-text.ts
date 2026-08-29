import { AUTHORIZED_CONTENT_SINKS, PLAIN_TEXT_MAX_LENGTH } from "./types.js";
import type {
  ContentSinkAuthorizationResult,
  PlainTextContentResult,
} from "./types.js";

export function createPlainTextContent(input: unknown): PlainTextContentResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      issue: {
        code: "INVALID_TEXT",
        path: "$",
        message: "plain-text content input must be a string",
      },
    };
  }

  if (input.length > PLAIN_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      issue: {
        code: "TEXT_TOO_LONG",
        path: "$",
        message: `plain-text content may contain at most ${PLAIN_TEXT_MAX_LENGTH} UTF-16 code units`,
      },
    };
  }

  return {
    ok: true,
    value: Object.freeze({ sink: "plain-text", value: input }),
  };
}

export function authorizeContentSink(sink: unknown): ContentSinkAuthorizationResult {
  if (typeof sink === "string" && AUTHORIZED_CONTENT_SINKS.includes(sink as "plain-text")) {
    return { ok: true, value: "plain-text" };
  }

  return {
    ok: false,
    issue: {
      code: "UNSUPPORTED_SINK",
      path: "$.sink",
      message: "only the plain-text content sink is authorized by the MVP security contract",
    },
  };
}
