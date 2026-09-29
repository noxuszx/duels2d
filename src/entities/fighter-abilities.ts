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
      | "casting-locked";

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
      private activePhaseVersionValue = 0;

      get activePhaseVersion(): number {
            return this.activePhaseVersionValue;
      }

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

      update(deltaMs: number): void {
            if (!this.active || deltaMs <= 0) return;

            let elapsedMs = deltaMs;
            while (this.active) {
                  if (this.remainingMs > elapsedMs) {
                        this.remainingMs -= elapsedMs;
                        return;
                  }

                  elapsedMs -= this.remainingMs;
                  this.remainingMs = 0;

                  if (this.state === "windup") {
                        this.beginActive();
                  } else if (this.state === "active") {
                        this.finishActive();
                  } else if (this.state === "recovery") {
                        this.reset();
                  } else {
                        return;
                  }
            }
      }

      beginActive(): void {
            if (this.state !== "windup" || !this.active) return;
            this.onAudioStop?.(this.active, "windup");
            this.state = "active";
            this.activePhaseVersionValue++;
            this.remainingMs = this.hasCollisionDash()
                  ? 5_000
                  : this.active.timing.activeMs;
            this.onAudioEvent?.(this.active, "active");
      }

      finishActive(): void {
            if (this.state !== "active" || !this.active) return;
            this.onAudioStop?.(this.active, "active");
            this.state = "recovery";
            this.remainingMs = this.active.timing.recoveryMs;
            if (this.remainingMs <= 0) {
                  this.reset();
            }
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
