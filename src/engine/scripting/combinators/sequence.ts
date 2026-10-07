import type { AnyScriptOperation, ScriptGenerator, ScriptOperation } from "../operation";
import { OperationRejected, OperationRunner } from "../operation-runner";

/** An inert generator branch for all/race, using the foreground operation runner. */
export function sequence<T>(factory: () => ScriptGenerator<T>): ScriptOperation<T> {
      let runner: OperationRunner<T> | null = null;
      let started = false;
      let cancelled = false;
      const operation: AnyScriptOperation & { readonly result: T } = {
            start(scope): boolean {
                  if (started || cancelled || scope.isClosed) return false;
                  started = true;
                  scope.add(() => { cancelled = true; runner?.cancel("interrupted"); });
                  runner = new OperationRunner(factory());
                  if (cancelled) { runner.cancel("interrupted"); return false; }
                  try { runner.drain(0); }
                  catch (error) { if (!(error instanceof OperationRejected)) throw error; return false; }
                  return !cancelled && !runner.rejectionReason && (runner.accepted || runner.isComplete);
            },
            advance: deltaMs => !cancelled && runner && Number.isFinite(deltaMs) && deltaMs > 0 ? runner.drain(deltaMs) : 0,
            contact: event => { if (!cancelled) runner?.contact(event); },
            get nextBoundaryMs() { if (!cancelled) runner?.drain(0); return runner?.nextBoundaryMs ?? Infinity; },
            get isComplete() { if (!cancelled) runner?.drain(0); return !cancelled && (runner?.isComplete ?? false); },
            get endReason() { return runner?.isComplete && !cancelled ? "complete" as const : undefined; },
            get result(): T {
                  if (!runner) throw new Error("Cannot read a sequence result before completion");
                  return runner.result;
            },
            get rejectionReason() { return runner?.rejectionReason; },
            cancel(reason): void { cancelled = true; runner?.cancel(reason); },
      };
      // This always supplies a T result, including when the void contract permits omission.
      return operation as ScriptOperation<T>;
}
