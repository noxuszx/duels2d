import type { CancellationReason, ContactEvent } from "../contracts";
import type { ScriptScope } from "./scope";

export type OperationEndReason = "complete" | "collision" | "timeout" | "source-closed";

/** One inert use of a mechanic. Cancellation is never successful completion. */
interface OperationLifecycle {
      start(scope: ScriptScope): boolean;
      advance(deltaMs: number): number;
      readonly isComplete: boolean;
      readonly endReason?: OperationEndReason;
      readonly rejectionReason?: "rejected" | "resource-conflict";
      /**
       * Time until the next possible completion during advance(), for concurrent slicing.
       * Omission promises that advance consumes its entire budget unless already complete.
       * Timed operations must expose their boundary; contact-only completion may omit it.
       */
      readonly nextBoundaryMs?: number;
      cancel(reason: CancellationReason): void;
      contact?(event: ContactEvent): void;
}

/** Value operations must provide a result; only void effects may omit it. Read after completion. */
export type ScriptOperation<TResult = void> = OperationLifecycle & (
      [TResult] extends [void]
            ? [void] extends [TResult] ? { readonly result?: TResult } : { readonly result: TResult }
            : { readonly result: TResult }
);

/** Heterogeneous execution/collection boundary; individual operations retain their result contracts. */
export type AnyScriptOperation = OperationLifecycle & { readonly result?: unknown };
export type ScriptGenerator<TResult = void> = Generator<AnyScriptOperation, TResult, unknown>;
export type OperationResult<T> = T extends { readonly result?: infer R } ? R : void;
