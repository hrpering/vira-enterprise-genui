import {
  VIRA_EXTERNAL_BRAND_SDK_VERSION,
  type ViraBrandExperienceRequest,
  type ViraBrandExperienceResponse,
  type ViraBrandTransport,
} from "./types.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateRequest(input: ViraBrandExperienceRequest): void {
  if (!isPlainObject(input)) throw new TypeError("invalid Vira brand request shape");
  const keys = Object.keys(input);
  const expected = input.versionRef === undefined
    ? ["environment", "experienceId", "version"]
    : ["environment", "experienceId", "version", "versionRef"];
  if (keys.sort().join("\0") !== expected.sort().join("\0")) throw new TypeError("invalid Vira brand request shape");
  if (input.version !== VIRA_EXTERNAL_BRAND_SDK_VERSION || !ID.test(input.experienceId)) throw new TypeError("invalid Vira brand request identity");
  if (!(["dev", "staging", "production"] as const).includes(input.environment)) throw new TypeError("invalid Vira brand environment");
  if (input.versionRef !== undefined && !ID.test(input.versionRef)) throw new TypeError("invalid Vira brand versionRef");
}

function parseResponse(input: unknown): ViraBrandExperienceResponse {
  if (!isPlainObject(input) || Object.keys(input).sort().join("\0") !== "experience\0version" || input.version !== VIRA_EXTERNAL_BRAND_SDK_VERSION || input.experience === undefined) {
    throw new TypeError("invalid Vira brand response");
  }
  return Object.freeze({ version: VIRA_EXTERNAL_BRAND_SDK_VERSION, experience: input.experience });
}

export class ViraBrandClient {
  readonly #transport: ViraBrandTransport;

  private constructor(transport: ViraBrandTransport) {
    this.#transport = transport;
  }

  static create(transport: ViraBrandTransport): ViraBrandClient {
    if (!isPlainObject(transport) || typeof transport.request !== "function") throw new TypeError("ViraBrandClient requires an injected transport");
    return new ViraBrandClient(transport);
  }

  async experience(input: ViraBrandExperienceRequest): Promise<ViraBrandExperienceResponse> {
    validateRequest(input);
    const request = Object.freeze({ ...input });
    let output: unknown;
    try {
      output = await this.#transport.request(request);
    } catch {
      throw new Error("Vira brand transport rejected the request");
    }
    return parseResponse(output);
  }
}
