export const SEMANTIC_SEGMENT_MAX_LENGTH = 63 as const;
export const SEMANTIC_NAMESPACE_MAX_LENGTH = 255 as const;

const semanticSegmentPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isSemanticSegment(value: string): boolean {
  return value.length >= 1 && value.length <= SEMANTIC_SEGMENT_MAX_LENGTH && semanticSegmentPattern.test(value);
}

export function isSemanticNamespace(value: string): boolean {
  if (value.length < 1 || value.length > SEMANTIC_NAMESPACE_MAX_LENGTH) return false;
  const segments = value.split(".");
  return segments.length > 0 && segments.every(isSemanticSegment);
}
