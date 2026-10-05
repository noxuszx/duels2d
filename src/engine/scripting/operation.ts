import type { CancellationReason, ContactEvent } from "../contracts";
import type { ScriptScope } from "./scope";

export type OperationEndReason = "complete" | "collision" | "timeout";

/** One inert use of a mechanic. Cancellation is never successful completion. */
export interface ScriptOperation {
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
