import type { Facing } from "../types/fighter";
import type {
      AbilityAudioEvent,
      AbilityConfig,
      AbilityState,
      SwingAction,
} from "../abilities/types";
import { calculateSwingAngle } from "../abilities/actions/swing-action";

/** Owns the ability runtime state machine, timers, cooldowns, and swing animation for a fighter. */
export class FighterAbilities {
      private readonly lastUseTimes = new Map<string, number>();

      state: AbilityState = "idle";
      facing: Facing | null = null;
      active: AbilityConfig | null = null;
      timer = 0;

      constructor(
            private readonly onAudioEvent?: (
                  ability: AbilityConfig,
                  event: AbilityAudioEvent,
            ) => void,
            private readonly onAudioStop?: (
                  ability: AbilityConfig,
                  event: AbilityAudioEvent,
            ) => void,
      ) {}

      canUse(ability: AbilityConfig, nowMs: number): boolean {
            return (
                  nowMs - (this.lastUseTimes.get(ability.id) ?? -Infinity) >=
                  ability.timing.cooldownMs
            );
      }

      start(
            ability: AbilityConfig,
            currentFacing: Facing,
            nowMs = performance.now(),
      ): void {
            if (this.active) {
                  this.onAudioStop?.(this.active, "active");
                  this.onAudioStop?.(this.active, "windup");
            }
            this.active = ability;
            this.facing = currentFacing;
            this.lastUseTimes.set(ability.id, nowMs);
            this.state = "windup";
            this.timer = ability.timing.windupFrames;
            this.onAudioEvent?.(ability, "windup");
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

      update(): void {
            if (!this.active || this.timer <= 0) return;
            this.timer--;
            if (this.state === "windup" && this.timer <= 0) {
                  this.beginActive();
            } else if (this.state === "active" && this.timer <= 0) {
                  this.finishActive();
            } else if (this.state === "recovery" && this.timer <= 0) {
                  this.reset();
            }
      }

      beginActive(): void {
            if (this.state !== "windup" || !this.active) return;
            this.onAudioStop?.(this.active, "windup");
            this.state = "active";
            this.timer = this.hasCollisionDash()
                  ? 600
                  : this.active.timing.activeFrames;
            this.onAudioEvent?.(this.active, "active");
      }

      finishActive(): void {
            if (this.state !== "active" || !this.active) return;
            this.onAudioStop?.(this.active, "active");
            this.state = "recovery";
            this.timer = this.active.timing.recoveryFrames;
            if (this.timer <= 0) {
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
            this.timer = 0;
      }

      getSwingAngle(): number | null {
            const swing = this.active?.actions.find(
                  (action): action is SwingAction => action.type === "swing",
            );
            if (!swing) return null;
            return calculateSwingAngle(
                  swing,
                  this.state,
                  this.timer,
                  this.active?.timing.activeFrames ?? 1,
            );
      }
}
