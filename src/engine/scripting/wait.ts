import type { CancellationReason } from "../contracts";
import type { ScriptOperation } from "./operation";
import type { ScriptScope } from "./scope";

export function wait(durationMs: number): ScriptOperation {
      if (!Number.isFinite(durationMs) || durationMs < 0) {
            throw new RangeError("Wait duration must be finite and nonnegative");
      }
      let remainingMs = durationMs;
      let started = false;
      let complete = false;
      let cancelled = false;
      return {
            start(_scope: ScriptScope): boolean {
                  if (started || cancelled) return false;
                  started = true;
                  complete = remainingMs <= 1e-9;
                  return true;
            },
            advance(deltaMs: number): number {
                  if (!started || complete || cancelled || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
                  const consumed = Math.min(deltaMs, remainingMs);
                  remainingMs -= consumed;
                  complete = remainingMs <= 1e-9;
                  return consumed;
            },
            get isComplete() { return complete; },
            get endReason() { return complete ? "complete" as const : undefined; },
            cancel(_reason: CancellationReason): void { cancelled = true; },
      };
}
