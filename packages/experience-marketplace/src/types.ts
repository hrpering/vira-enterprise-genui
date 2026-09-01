export const EXPERIENCE_MARKETPLACE_SCHEMA_VERSION = "1" as const;
export const EXPERIENCE_MARKETPLACE_MAX_LISTINGS = 256 as const;
export const EXPERIENCE_MARKETPLACE_LISTINGS_JSON_MAX_LENGTH = 262_144 as const;
export const EXPERIENCE_MARKETPLACE_QUERY_JSON_MAX_LENGTH = 4_096 as const;
export const EXPERIENCE_MARKETPLACE_QUERY_TEXT_MAX_LENGTH = 200 as const;
export const EXPERIENCE_MARKETPLACE_QUERY_FILTER_MAX_LENGTH = 512 as const;
export const EXPERIENCE_MARKETPLACE_QUERY_LIMIT_MAX = 100 as const;

export interface ExperienceMarketplaceListingRef {
  readonly id: string;
  readonly version: string;
}

export interface ExperienceMarketplaceEntry {
  readonly id: string;
  readonly version: string;
  readonly publisherId: string;
  readonly publisherName: string;
  readonly name: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly minViraVersion: string;
  readonly maxViraVersion?: string;
}

export interface ExperienceMarketplaceCatalog {
  readonly schemaVersion: typeof EXPERIENCE_MARKETPLACE_SCHEMA_VERSION;
  readonly entries: readonly ExperienceMarketplaceEntry[];
}

export type ExperienceMarketplaceValidationCode =
  | "INVALID_REGISTRY"
  | "INVALID_LISTINGS"
  | "LISTING_LIMIT_EXCEEDED"
  | "INVALID_LISTING"
  | "DUPLICATE_LISTING"
  | "MISSING_LISTING";

export interface ExperienceMarketplaceValidationIssue {
  readonly code: ExperienceMarketplaceValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceMarketplaceCatalogResult =
  | { readonly ok: true; readonly value: ExperienceMarketplaceCatalog }
  | { readonly ok: false; readonly issue: ExperienceMarketplaceValidationIssue };

export interface ExperienceMarketplaceQuery {
  readonly text?: string;
  readonly publisherId?: string;
  readonly tag?: string;
  readonly limit?: number;
}

export interface ExperienceMarketplaceQueryResultValue {
  readonly entries: readonly ExperienceMarketplaceEntry[];
}

export type ExperienceMarketplaceQueryCode = "INVALID_CATALOG" | "INVALID_QUERY";

export type ExperienceMarketplaceQueryResult =
  | { readonly ok: true; readonly value: ExperienceMarketplaceQueryResultValue }
  | {
      readonly ok: false;
      readonly issue: {
        readonly code: ExperienceMarketplaceQueryCode;
        readonly path: "$.catalog" | "$.query";
        readonly message: string;
      };
    };
