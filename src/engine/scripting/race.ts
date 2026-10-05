import type { ScriptOperation } from "./operation";
import { compoundOperation } from "./compound-operation";

/** Finish at the earliest branch boundary and cancel the remaining branches. */
export function race(...operations: ScriptOperation[]): ScriptOperation {
      return compoundOperation("race", operations);
}
