import type { ScriptOperation } from "../operation";

const TIMELINE_EPSILON_MS = 1e-9;

/** A single simulation timeline, including initialization and the exact endpoint. */
export function during(durationMs: number, tick: (deltaMs: number, elapsedMs: number) => void): ScriptOperation {
      if (!Number.isFinite(durationMs) || durationMs < 0) {
            throw new RangeError("Duration must be finite and nonnegative");
      }
      let elapsedMs = 0;
      let started = false;
      let cancelled = false;
      let complete = false;
      return {
            start(): boolean {
                  if (started || cancelled) return false;
                  started = true;
                  tick(0, 0);
                  complete = !cancelled && durationMs === 0;
                  return true;
            },
            advance(deltaMs: number): number {
                  if (!started || complete || cancelled || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
                  const consumed = Math.min(deltaMs, durationMs - elapsedMs);
                  elapsedMs += consumed;
                  if (durationMs - elapsedMs <= TIMELINE_EPSILON_MS) elapsedMs = durationMs;
                  tick(consumed, elapsedMs);
                  complete = !cancelled && elapsedMs === durationMs;
                  return consumed;
            },
            get isComplete() { return complete; },
            get nextBoundaryMs() { return Math.max(0, durationMs - elapsedMs); },
            get endReason() { return complete ? "complete" as const : undefined; },
            cancel(): void { cancelled = true; },
      };
}
