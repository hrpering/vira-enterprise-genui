export const VIRA_PRIVATE_PROVIDER_HTTP_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface ViraPrivateProviderHttpRequest {
  readonly method: "GET" | "PUT";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ViraPrivateProviderHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface ViraPrivateProviderHttpTransport {
  readonly request: (input: ViraPrivateProviderHttpRequest) => Promise<ViraPrivateProviderHttpResponse>;
}

export interface ViraFetchLikeResponse {
  readonly status: number;
  readonly text: () => Promise<string>;
}

export type ViraFetchLike = (
  input: string,
  init: Readonly<{
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly redirect: "error";
  }>,
) => Promise<ViraFetchLikeResponse>;

function validStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 100 && value <= 599;
}

function boundedBody(body: string): unknown {
  if (Buffer.byteLength(body, "utf8") > VIRA_PRIVATE_PROVIDER_HTTP_MAX_RESPONSE_BYTES) {
    throw new TypeError("private provider HTTP response exceeded the bounded response size");
  }
  if (body.length === 0) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new TypeError("private provider HTTP response was not canonical JSON");
  }
}

export function createFetchPrivateProviderHttpTransport(
  fetchLike: ViraFetchLike,
): ViraPrivateProviderHttpTransport {
  if (typeof fetchLike !== "function") throw new TypeError("private provider fetch transport is invalid");
  return Object.freeze({
    async request(input: ViraPrivateProviderHttpRequest): Promise<ViraPrivateProviderHttpResponse> {
      if (
        input === null
        || typeof input !== "object"
        || (input.method !== "GET" && input.method !== "PUT")
        || typeof input.url !== "string"
        || !input.url.startsWith("https://")
        || input.headers === null
        || typeof input.headers !== "object"
        || (input.body !== undefined && typeof input.body !== "string")
      ) throw new TypeError("private provider HTTP request is invalid");

      const response = await fetchLike(input.url, {
        method: input.method,
        headers: Object.freeze({ ...input.headers }),
        ...(input.body === undefined ? {} : { body: input.body }),
        redirect: "error",
      });
      if (response === null || typeof response !== "object" || !validStatus(response.status) || typeof response.text !== "function") {
        throw new TypeError("private provider HTTP transport returned an invalid response");
      }
      const text = await response.text();
      if (typeof text !== "string") throw new TypeError("private provider HTTP response body is invalid");
      return Object.freeze({ status: response.status, body: boundedBody(text) });
    },
  });
}
