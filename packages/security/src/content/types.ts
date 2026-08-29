export const PLAIN_TEXT_MAX_LENGTH = 65_536 as const;
export const AUTHORIZED_CONTENT_SINKS = Object.freeze(["plain-text"] as const);

export type AuthorizedContentSink = (typeof AUTHORIZED_CONTENT_SINKS)[number];

export interface PlainTextContent {
  readonly sink: "plain-text";
  readonly value: string;
}

export type PlainTextContentValidationCode =
  | "INVALID_TEXT"
  | "TEXT_TOO_LONG";

export interface PlainTextContentValidationIssue {
  readonly code: PlainTextContentValidationCode;
  readonly path: string;
  readonly message: string;
}

export type PlainTextContentResult =
  | { readonly ok: true; readonly value: PlainTextContent }
  | { readonly ok: false; readonly issue: PlainTextContentValidationIssue };

export type ContentSinkValidationCode = "UNSUPPORTED_SINK";

export interface ContentSinkValidationIssue {
  readonly code: ContentSinkValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ContentSinkAuthorizationResult =
  | { readonly ok: true; readonly value: AuthorizedContentSink }
  | { readonly ok: false; readonly issue: ContentSinkValidationIssue };
