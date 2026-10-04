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
      cancel(reason: CancellationReason): void;
      contact?(event: ContactEvent): void;
}
