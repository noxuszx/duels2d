import type { Entity } from "../../engine/entity";

export interface StatusCapabilities {
      canStartCast: boolean;
      canContinueCast: boolean;
      canMove: boolean;
}

export interface StatusContext {
      owner: Entity;
      sourceId: string | null;
      stacks: number;
      damage(amount: number, sourceId: string | null): void;
}

export interface StatusInstanceState {
      elapsedMs: number;
      pulseMs: number;
}

export interface StatusDefinition {
      id: string;
      /** Refreshes one timed instance; optional stacks are capped by maxStacks. */
      refresh?: "max" | "replace";
      maxStacks?: number;
      restrictions?: Partial<StatusCapabilities>;
      onApply?(context: StatusContext, state: StatusInstanceState): void;
      onTick?(context: StatusContext, state: StatusInstanceState, deltaMs: number): void;
      onExpire?(context: StatusContext, state: StatusInstanceState): void;
}

export interface StatusApplication<Id extends string = string> {
      id: Id;
      durationMs: number;
      sourceId?: string | null;
}

export type StatusApplyResult =
      | { applied: true; refreshed: boolean }
      | { applied: false; reason: "unknown-status" | "invalid-duration" | "owner-inactive" };
