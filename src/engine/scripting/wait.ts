import type { ScriptOperation } from "./operation";
import { during } from "./during";

export function wait(durationMs: number): ScriptOperation {
      return during(durationMs, () => {});
}
