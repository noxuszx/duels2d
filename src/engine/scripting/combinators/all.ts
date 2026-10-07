import type { AnyScriptOperation, ScriptOperation, OperationResult } from "../operation";
import { compoundOperation } from "../compound-operation";

/** Advance operations concurrently; finish after the longest branch. */
export function all<const T extends readonly AnyScriptOperation[]>(...operations: T):
      ScriptOperation<{ readonly [K in keyof T]: OperationResult<T[K]> }> {
      return compoundOperation("all", operations) as ScriptOperation<{ readonly [K in keyof T]: OperationResult<T[K]> }>;
}
