import type { CancellationReason, ContactEvent } from "../contracts";
import type { AnyScriptOperation, OperationEndReason, ScriptOperation } from "./operation";
import { ScriptScope } from "./scope";
import { runAll } from "../cleanup";

interface Branch {
      index: number;
      operation: AnyScriptOperation;
      scope: ScriptScope;
      active: boolean;
}

/**
 * Operations share one clock, not a second task scheduler. Starts are sequential:
 * rejection releases every acquired resource, but cannot undo emitted damage, audio,
 * or other irreversible start callbacks. Put fallible acquisitions before such work.
 */
export function compoundOperation(mode: "all" | "race", operations: readonly AnyScriptOperation[]): ScriptOperation<unknown> {
      if (mode === "race" && operations.length === 0) throw new RangeError("Race requires at least one branch");
      const branches: Branch[] = [];
      let started = false;
      let stopped = false;
      let cancelled = false;
      let complete = false;
      let endReason: OperationEndReason | undefined;
      let rejectionReason: "rejected" | "resource-conflict" | undefined;
      let result: unknown;
      const results: unknown[] = new Array(operations.length);

      function closeBranch(branch: Branch, reason?: CancellationReason): void {
            if (!branch.active) return;
            branch.active = false;
            runAll([
                  () => {
                        if (reason) branch.operation.cancel(reason);
                        else if (mode === "all") results[branch.index] = branch.operation.result;
                  },
                  () => branch.scope.release(),
            ]);
      }

      function closeAll(reason: CancellationReason): void {
            stopped = true;
            runAll(branches.map(branch => () => closeBranch(branch, reason)));
      }

      function fail(error: unknown): never {
            try { closeAll("interrupted"); }
            catch { /* Preserve the triggering error after attempting every cleanup. */ }
            throw error;
      }

      function settle(): void {
            if (stopped || complete) return;
            const finished = branches.filter(branch => branch.active && branch.operation.isComplete);
            if (mode === "race" && finished.length > 0) {
                  const winner = finished[0];
                  endReason = winner.operation.endReason ?? "complete";
                  result = Object.freeze({ index: winner.index, result: winner.operation.result });
                  closeBranch(winner);
                  if (stopped) return;
                  closeAll("interrupted");
                  complete = !cancelled;
            } else {
                  // Releasing one branch can synchronously finish or cancel another.
                  let ready = finished;
                  while (!stopped && ready.length > 0) {
                        for (const branch of ready) closeBranch(branch);
                        ready = branches.filter(branch => branch.active && branch.operation.isComplete);
                  }
                  if (!stopped && branches.every(branch => !branch.active)) {
                        endReason = "complete";
                        complete = true;
                        result = Object.freeze([...results]);
                  }
            }
      }

      function boundary(): number {
            let next = Infinity;
            for (const branch of branches) {
                  if (!branch.active) continue;
                  const time = branch.operation.nextBoundaryMs;
                  if (time === undefined) continue;
                  if (Number.isNaN(time) || time < 0) throw new RangeError("Operation returned an invalid time boundary");
                  next = Math.min(next, time);
            }
            return next;
      }

      return {
            start(scope: ScriptScope): boolean {
                  if (started || stopped || scope.isClosed) return false;
                  started = true;
                  scope.add(() => { cancelled = true; closeAll("interrupted"); });
                  try {
                        if (new Set(operations).size !== operations.length) {
                              throw new TypeError("Concurrent branches must use distinct operation instances");
                        }
                        for (const operation of operations) {
                              if (stopped) return false;
                              if (!operation || typeof operation.start !== "function" || typeof operation.advance !== "function") {
                                    throw new TypeError("Invalid concurrent operation");
                              }
                              const branch = { index: branches.length, operation, scope: new ScriptScope(), active: true };
                              branches.push(branch);
                              const accepted = operation.start(branch.scope);
                              if (stopped) return false;
                              if (!accepted) {
                                    rejectionReason = operation.rejectionReason ?? "rejected";
                                    closeAll("interrupted");
                                    return false;
                              }
                        }
                        settle();
                        return true;
                  } catch (error) { return fail(error); }
            },
            advance(deltaMs: number): number {
                  if (!started || stopped || complete || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
                  let consumedMs = 0;
                  try {
                        settle();
                        while (!stopped && !complete && consumedMs < deltaMs) {
                              const stepMs = Math.min(deltaMs - consumedMs, boundary());
                              if (stepMs <= 0) throw new Error("Concurrent operation made no progress at its time boundary");
                              for (const branch of branches) {
                                    if (stopped) break;
                                    if (!branch.active || branch.operation.isComplete) continue;
                                    const usedMs = branch.operation.advance(stepMs);
                                    if (stopped) break;
                                    if (!Number.isFinite(usedMs) || usedMs < 0 || usedMs > stepMs) {
                                          throw new RangeError("Operation returned invalid consumed time");
                                    }
                                    if (usedMs !== stepMs) {
                                          throw new Error("Concurrent operation must declare its completion time boundary");
                                    }
                              }
                              const previousMs = consumedMs;
                              consumedMs += stepMs;
                              if (consumedMs === previousMs) throw new Error("Concurrent operation consumed too little time to advance tick");
                              settle();
                        }
                        return consumedMs;
                  } catch (error) { return fail(error); }
            },
            contact(event: ContactEvent): void {
                  if (!started || stopped || complete) return;
                  try {
                        for (const branch of branches) {
                              if (stopped || complete) break;
                              if (branch.active) branch.operation.contact?.(event);
                              settle();
                        }
                  } catch (error) { fail(error); }
            },
            get nextBoundaryMs() {
                  try { if (started) settle(); return complete ? 0 : boundary(); }
                  catch (error) { return fail(error); }
            },
            get isComplete() {
                  try { if (started) settle(); return complete; }
                  catch (error) { return fail(error); }
            },
            get endReason() { return endReason; },
            get result() {
                  if (!complete) throw new Error("Cannot read a compound result before completion");
                  return result;
            },
            get rejectionReason() { return rejectionReason; },
            cancel(reason: CancellationReason): void { cancelled = true; closeAll(reason); },
      };
}
