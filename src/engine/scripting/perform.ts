import type { ScriptGenerator, ScriptOperation } from "./operation";

/** Type the result at the generator boundary; execution still belongs to OperationRunner. */
export function* perform<T>(operation: ScriptOperation<T>): ScriptGenerator<T> {
      return (yield operation) as T;
}
