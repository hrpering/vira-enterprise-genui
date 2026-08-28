export interface SequenceIdFactory {
  next(): string;
  reset(): void;
}

export function createSequenceIdFactory(prefix = "test", startAt = 1): SequenceIdFactory {
  if (!prefix) throw new TypeError("prefix must not be empty");
  if (!Number.isSafeInteger(startAt)) throw new TypeError("startAt must be a safe integer");

  let current = startAt;

  return {
    next() {
      const value = `${prefix}-${current}`;
      current += 1;
      return value;
    },
    reset() {
      current = startAt;
    },
  };
}
