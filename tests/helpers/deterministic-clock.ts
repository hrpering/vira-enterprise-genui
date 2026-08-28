export interface DeterministicClock {
  now(): number;
  set(value: number): void;
  advance(milliseconds: number): number;
}

function finiteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
}

export function createDeterministicClock(initialValue = 0): DeterministicClock {
  finiteNumber(initialValue, "initialValue");
  let current = initialValue;

  return {
    now: () => current,
    set(value) {
      finiteNumber(value, "clock value");
      current = value;
    },
    advance(milliseconds) {
      finiteNumber(milliseconds, "milliseconds");
      current += milliseconds;
      return current;
    },
  };
}
