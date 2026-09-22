import type { Facing } from "../types/fighter";
import type { AbilityConfig, AbilityState, SwingAction } from "../abilities/types";
import { calculateSwingAngle } from "../abilities/actions/swing-action";

/** Owns the ability runtime state machine, timers, cooldowns, and swing animation for a fighter. */
export class FighterAbilities {
      private readonly lastUseTimes = new Map<string, number>();

      state: AbilityState = "idle";
      facing: Facing | null = null;
      active: AbilityConfig | null = null;
      timer = 0;

      constructor(private readonly onSound?: (type: string) => void) {}

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
            this.active = ability;
            this.facing = currentFacing;
            this.lastUseTimes.set(ability.id, nowMs);
            this.state = "windup";
            this.timer = ability.timing.windupFrames;
            this.onSound?.("attackWindup");
      }

      lockFacingToward(targetX: number, selfX: number): void {
            this.facing = targetX < selfX ? "left" : "right";
      }

      update(): void {
            if (!this.active || this.timer <= 0) return;
            if (
                  this.state === "active" &&
                  this.active.actions.some(
                        (action) =>
                              action.type === "dash" && action.endOn.length > 0,
                  )
            ) {
                  return;
            }

            this.timer--;
            if (this.state === "windup" && this.timer <= 0) {
                  this.state = "active";
                  this.timer = this.active.timing.activeFrames;
                  this.onSound?.("attackActive");
            } else if (this.state === "active" && this.timer <= 0) {
                  this.state = "recovery";
                  this.timer = this.active.timing.recoveryFrames;
            } else if (this.state === "recovery" && this.timer <= 0) {
                  this.reset();
            }
      }

      finishActive(): void {
            if (this.state !== "active" || !this.active) return;
            this.state = "recovery";
            this.timer = this.active.timing.recoveryFrames;
            if (this.timer <= 0) {
                  this.reset();
            }
      }

      reset(): void {
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
