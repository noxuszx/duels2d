import type { AnyScriptOperation, ScriptOperation, OperationResult } from "../operation";
import { compoundOperation } from "../compound-operation";

/** Finish at the earliest branch boundary and cancel the remaining branches. */
export type RaceResult<T extends readonly AnyScriptOperation[]> = {
      [K in keyof T]: {
            readonly index: K extends `${infer N extends number}` ? N : number;
            readonly result: OperationResult<T[K]>
      }
}[number];

export function race<const T extends readonly [AnyScriptOperation, ...AnyScriptOperation[]]>(...operations: T): ScriptOperation<RaceResult<T>> {
      return compoundOperation("race", operations) as ScriptOperation<RaceResult<T>>;
}
