import type { Facing } from "../types/fighter";
import type {
      AbilityAudioEvent,
      AbilityConfig,
      AbilityState,
      SwingAction,
} from "../abilities/types";
import { calculateSwingAngle } from "../abilities/actions/swing-action";

export type AbilityStartFailureReason =
      | "already-active"
      | "cooldown"
      | "casting-locked"
      | "invalid-target"
      | "combat-ended";

export interface AbilityPhaseObserver {
      tick(phase: Exclude<AbilityState, "idle">, deltaMs: number): void;
      transition(): void;
}

export type AbilityStartResult =
      | { started: true }
      | { started: false; reason: AbilityStartFailureReason };

/** Owns the ability runtime state machine, timers, cooldowns, and swing animation for a fighter. */
export class FighterAbilities {
      private readonly lastUseTimes = new Map<string, number>();

      state: AbilityState = "idle";
      facing: Facing | null = null;
      active: AbilityConfig | null = null;
      remainingMs = 0;
      constructor(
            private readonly onAudioEvent?: (
                  ability: AbilityConfig,
                  event: AbilityAudioEvent,
            ) => void,
            private readonly onAudioStop?: (
                  ability: AbilityConfig,
                  event: AbilityAudioEvent,
            ) => void,
            private readonly canStartAbility: () => boolean = () => true,
      ) { }

      tryStart(
            ability: AbilityConfig,
            currentFacing: Facing,
            nowMs: number,
      ): AbilityStartResult {
            if (this.state !== "idle" || this.active !== null) {
                  return { started: false, reason: "already-active" };
            }
            if (!this.canStartAbility()) {
                  return { started: false, reason: "casting-locked" };
            }
            if (
                  nowMs - (this.lastUseTimes.get(ability.id) ?? -Infinity) <
                  ability.timing.cooldownMs
            ) {
                  return { started: false, reason: "cooldown" };
            }

            this.active = ability;
            this.facing = currentFacing;
            this.lastUseTimes.set(ability.id, nowMs);
            this.state = "windup";
            this.remainingMs = ability.timing.windupMs;
            this.onAudioEvent?.(ability, "windup");
            return { started: true };
      }

      lockFacingToward(targetX: number, selfX: number): void {
            this.facing = targetX < selfX ? "left" : "right";
      }

      private hasCollisionDash(): boolean {
            const dash = this.active?.actions.find(
                  (action) => action.type === "dash",
            );
            return Boolean(
                  dash &&
                  dash.type === "dash" &&
                  (dash.endOn.includes("fighter-collision") ||
                        dash.endOn.includes("wall-collision")),
            );
      }

      /** Zero delta drains zero-duration boundaries without ticking timed operations. */
      update(deltaMs: number, observer?: AbilityPhaseObserver): void {
            if (!this.active || !Number.isFinite(deltaMs) || deltaMs < 0) return;

            let elapsedMs = deltaMs;
            while (this.active) {
                  const phase = this.state;
                  if (phase === "idle") return;
                  const consumed = Math.min(this.remainingMs, elapsedMs);
                  this.remainingMs -= consumed;
                  elapsedMs -= consumed;
                  if (consumed > 0) observer?.tick(phase, consumed);
                  // A component may end/cancel the phase from its update callback.
                  if (!this.active) return;
                  if (this.state !== phase) continue;
                  if (this.remainingMs > 0) return;

                  if (this.state === "windup") {
                        this.beginActive();
                  } else if (this.state === "active") {
                        this.finishActive();
                  } else if (this.state === "recovery") {
                        this.reset();
                  } else {
                        return;
                  }
                  observer?.transition();
            }
      }

      beginActive(): void {
            if (this.state !== "windup" || !this.active) return;
            this.onAudioStop?.(this.active, "windup");
            this.state = "active";
            this.remainingMs = this.hasCollisionDash()
                  ? 5_000
                  : this.active.timing.activeMs;
            this.onAudioEvent?.(this.active, "active");
      }

      /** Enters recovery; update(0, observer) drains an immediate recovery with its phase hook. */
      finishActive(): void {
            if (this.state !== "active" || !this.active) return;
            this.onAudioStop?.(this.active, "active");
            this.state = "recovery";
            this.remainingMs = this.active.timing.recoveryMs;
      }

      reset(): void {
            if (this.active) {
                  this.onAudioStop?.(this.active, "active");
                  this.onAudioStop?.(this.active, "windup");
            }
            this.state = "idle";
            this.active = null;
            this.facing = null;
            this.remainingMs = 0;
      }

      getSwingAngle(): number | null {
            const swing = this.active?.actions.find(
                  (action): action is SwingAction => action.type === "swing",
            );
            if (!swing) return null;
            return calculateSwingAngle(
                  swing,
                  this.state,
                  this.remainingMs,
                  this.active?.timing.activeMs ?? 1,
            );
      }
}
