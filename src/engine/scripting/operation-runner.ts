import type { CancellationReason, ContactEvent } from "../contracts";
import type { AnyScriptOperation, ScriptGenerator } from "./operation";
import { ScriptScope } from "./scope";

type Rejection = "rejected" | "resource-conflict";

/** Carries a nested branch rejection through concurrent cleanup to its foreground move. */
export class OperationRejected extends Error {
      constructor(readonly reason: Rejection) { super(`Operation rejected: ${reason}`); }
}

interface RunnerHooks {
      ensureActive?(): boolean;
      started?(): void;
      operationCompleted?(reason?: string): void;
      completed?(): void;
      rejected?(reason: Rejection): void;
      closed?(): void;
}

/** The single generator execution path, shared by foreground moves and composed sequences. */
export class OperationRunner<TResult = void> {
      private operation: AnyScriptOperation | null = null;
      private scope: ScriptScope | null = null;
      private generatorExecuting = false;
      private closePending = false;
      private dispatching = false;
      private running = true;
      accepted = false;
      isComplete = false;
      rejectionReason: Rejection | undefined;
      private resultValue: TResult | undefined;
      private nextValue: unknown;

      constructor(private readonly generator: ScriptGenerator<TResult>, private readonly hooks: RunnerHooks = {}) { }

      get result(): TResult {
            if (!this.isComplete) throw new Error("Cannot read a script result before completion");
            return this.resultValue as TResult;
      }

      get isClosing(): boolean { return this.closePending; }
      get nextBoundaryMs(): number { return this.isComplete ? 0 : this.operation?.nextBoundaryMs ?? Infinity; }

      private active(): boolean { return this.running && (this.hooks.ensureActive?.() ?? true) && this.running; }

      drain(deltaMs: number): number {
            let remainingMs = deltaMs;
            let immediateSteps = 0;
            try {
                  while (this.active()) {
                        if (++immediateSteps > 1024) throw new Error("Task exceeded the immediate operation limit");
                        if (this.operation?.isComplete) {
                              const operation = this.operation;
                              const scope = this.scope;
                              this.nextValue = operation.result;
                              this.operation = null;
                              this.scope = null;
                              scope?.release();
                              this.hooks.operationCompleted?.(operation.endReason);
                        }
                        if (!this.active()) break;
                        if (!this.operation) {
                              const next = this.next();
                              if (!this.active()) break;
                              if (next.done) {
                                    this.running = false;
                                    this.isComplete = true;
                                    this.resultValue = next.value;
                                    this.hooks.completed?.();
                                    break;
                              }
                              const operation = next.value;
                              if (!operation || typeof operation.start !== "function" || typeof operation.advance !== "function") {
                                    throw new TypeError("Task yielded an invalid operation");
                              }
                              this.operation = operation;
                              this.scope = new ScriptScope();
                              const accepted = operation.start(this.scope);
                              if (!this.active()) break;
                              if (!accepted) {
                                    this.rejectionReason = operation.rejectionReason ?? "rejected";
                                    this.cancel("interrupted");
                                    if (this.hooks.rejected) this.hooks.rejected(this.rejectionReason);
                                    else throw new OperationRejected(this.rejectionReason);
                                    break;
                              }
                              this.accepted = true;
                              this.hooks.started?.();
                              if (!this.active()) break;
                              if (operation.isComplete) continue;
                        }
                        const operation = this.operation;
                        if (!operation || remainingMs <= 0) break;
                        const consumed = operation.advance(remainingMs);
                        if (!Number.isFinite(consumed) || consumed < 0 || consumed > remainingMs) {
                              throw new RangeError("Operation returned invalid consumed time");
                        }
                        const beforeMs = remainingMs;
                        remainingMs -= consumed;
                        if (!this.active()) break;
                        if (consumed > 0 && beforeMs === remainingMs) throw new Error("Operation consumed too little time to advance tick");
                        if (consumed > 0) immediateSteps = 0;
                        if (operation.isComplete) continue;
                        if (consumed === 0) throw new Error("Operation made no progress");
                        if (remainingMs <= 0) break;
                  }
                  return deltaMs - remainingMs;
            } catch (error) {
                  try { this.cancel("interrupted"); } catch { /* Preserve the triggering error. */ }
                  throw error;
            }
      }

      contact(event: ContactEvent): void {
            if (!this.active() || this.dispatching) return;
            this.dispatching = true;
            try { this.operation?.contact?.(event); }
            catch (error) {
                  try { this.cancel("interrupted"); } catch { /* Preserve the triggering error. */ }
                  throw error;
            } finally { this.dispatching = false; }
            if (this.active()) this.drain(0);
      }

      cancel(reason: CancellationReason): void {
            if (!this.running) return;
            this.running = false;
            const operation = this.operation;
            const scope = this.scope;
            this.operation = null;
            this.scope = null;
            try { operation?.cancel(reason); }
            finally {
                  try { scope?.release(); }
                  finally {
                        if (this.generatorExecuting) this.closePending = true;
                        else this.close();
                  }
            }
      }

      private close(): void {
            try { this.generator.return(undefined as TResult); }
            finally { this.hooks.closed?.(); }
      }

      private next(): IteratorResult<AnyScriptOperation, TResult> {
            this.generatorExecuting = true;
            try {
                  const value = this.nextValue;
                  this.nextValue = undefined;
                  return this.generator.next(value);
            }
            finally {
                  this.generatorExecuting = false;
                  if (this.closePending) {
                        this.closePending = false;
                        this.close();
                  }
            }
      }
}
