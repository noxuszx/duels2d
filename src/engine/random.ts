/** Simulation-owned, repeatable gameplay randomness. Cosmetic choices use another source. */
export class SeededRandom {
      private state: number;

      constructor(seed: number) {
            if (!Number.isSafeInteger(seed)) throw new RangeError("Simulation seed must be a safe integer");
            this.state = seed >>> 0;
      }

      next(): number {
            this.state = (this.state + 0x6d2b79f5) >>> 0;
            let value = this.state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
      }

      between(minimum: number, maximum: number): number {
            if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum)
                  throw new RangeError("Invalid random range");
            return minimum + (maximum - minimum) * this.next();
      }
}
