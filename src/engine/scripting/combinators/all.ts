import type { ScriptOperation } from "../operation";
import { compoundOperation } from "../compound-operation";

/** Advance operations concurrently; finish after the longest branch. */
export function all(...operations: ScriptOperation[]): ScriptOperation {
      return compoundOperation("all", operations);
}
