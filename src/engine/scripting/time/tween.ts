import type { ScriptOperation } from "../operation";
import { during } from "./during";

export function tween(durationMs: number, tick: (progress: number, elapsedMs: number) => void): ScriptOperation {
      return during(durationMs, (_deltaMs, elapsedMs) => tick(durationMs === 0 ? 1 : elapsedMs / durationMs, elapsedMs));
}
