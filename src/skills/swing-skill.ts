import type { AbilityState } from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import { calculateSwingAngle } from "../abilities/actions/swing-action";
import type { SwingSkillOptions } from "./types";

/**
 * Reusable melee-swing runtime. It restricts hits to the canonical active
 * ability window and exposes the weapon angle used by rendering.
 */
export class SwingSkill {
      private options: SwingSkillOptions | null = null;
      private hit = false;

      get isActive(): boolean {
            return this.options !== null;
      }

      start(options: SwingSkillOptions): void {
            this.options = options;
            this.hit = false;
      }

      update(state: AbilityState, target: Fighter | null): void {
            if (!this.options) return;
            if (state === "idle") {
                  this.stop();
            } else if (state === "active" && !this.hit && target && !target.isDead) {
                  this.hit = true;
                  this.options.onHitEnemy?.(target);
            }
      }

      getAngle(state: "windup" | "active" | "recovery" | "idle", timer: number): number | null {
            if (!this.options?.action) return null;
            return calculateSwingAngle(
                  this.options.action,
                  state,
                  timer,
                  this.options.activeFrames,
            );
      }

      stop(): void {
            if (!this.options) return;
            const onComplete = this.options.onComplete;
            this.options = null;
            this.hit = false;
            onComplete?.();
      }
}
