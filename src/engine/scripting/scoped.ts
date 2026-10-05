import type { ScriptOperation } from "./operation";
import { ScriptScope, type ScriptResource } from "./scope";

/** Hold resources across a sequence; the shared runner executes its inner operations. */
export function* scoped<T>(
      acquire: (scope: ScriptScope) => T | null,
      script: (resource: T, scope: ScriptScope) => Generator<ScriptOperation, void, unknown>,
): Generator<ScriptOperation, void, unknown> {
      const scope = new ScriptScope();
      let resource: T | null = null;
      let started = false;
      let accepted = false;
      const acquisition: ScriptOperation = {
            start(): boolean {
                  if (started || scope.isClosed) return false;
                  started = true;
                  try {
                        resource = acquire(scope);
                        if (resource !== null && (typeof resource === "function" ||
                              (typeof resource === "object" && typeof (resource as { release?: unknown }).release === "function"))) {
                              scope.use(resource as ScriptResource);
                        }
                        accepted = resource !== null && !scope.isClosed;
                        if (!accepted) scope.release();
                        return accepted;
                  } catch (error) {
                        scope.release();
                        throw error;
                  }
            },
            advance: () => 0,
            get isComplete() { return accepted; },
            get endReason() { return accepted ? "complete" as const : undefined; },
            rejectionReason: "resource-conflict",
            cancel: () => scope.release(),
      };
      try {
            yield acquisition;
            if (accepted && !scope.isClosed) yield* script(resource as T, scope);
      } finally {
            scope.release();
      }
}
