import type { Fighter } from "../entities/fighter";
import type { GameplayOperation } from "../gameplay/action-scope";

export interface ShakeOptions {
      amplitudePx?: number;
      rotationRadians?: number;
      frequencyHz?: number;
}

/** Visual-only, simulation-timed shake. Its owner decides how long it runs. */
export class ShakeSkill implements GameplayOperation {
      private elapsedMs = 0;
      private closed = false;
      private readonly motion;

      constructor(fighter: Fighter, private readonly options: ShakeOptions = {}) {
            this.motion = fighter.presentation.acquireMotion();
      }

      update(deltaMs: number): void {
            if (this.closed || deltaMs <= 0) return;
            this.elapsedMs += deltaMs;
            const phase = this.elapsedMs / 1000 * Math.PI * 2 *
                  (this.options.frequencyHz ?? 28);
            this.motion.set({
                  x: Math.sin(phase) * (this.options.amplitudePx ?? 1.25),
                  y: Math.sin(phase * 1.17) * (this.options.amplitudePx ?? 1.25) * 0.8,
                  rotation: Math.sin(phase * 1.28) * (this.options.rotationRadians ?? 0.0125),
            });
      }

      cancel(): void {
            if (this.closed) return;
            this.closed = true;
            this.motion.release();
      }
}
