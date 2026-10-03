import type { CancellationReason } from "../gameplay/action-scope";
import type { FighterRuntimeComponent } from "../gameplay/fighter-runtime";

export interface HealthThresholdOptions {
      ratio: () => number;
      threshold: number;
      enabled: () => boolean;
      /** False keeps the trigger eligible for a later attempt. */
      onReached: () => boolean;
}

/** Observes an inclusive health threshold once; the character chooses the resulting action. */
export class HealthThresholdSkill implements FighterRuntimeComponent {
      private triggered = false;
      private generation = 0;

      constructor(private readonly options: HealthThresholdOptions) {
            if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1)
                  throw new Error("Invalid health threshold");
      }

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.triggered || !this.options.enabled()) return;
            const ratio = this.options.ratio();
            if (Number.isFinite(ratio) && ratio <= this.options.threshold) {
                  const generation = this.generation;
                  const accepted = this.options.onReached();
                  if (this.generation === generation) this.triggered = accepted;
            }
      }

      cancel(reason: CancellationReason): void {
            if (reason === "reset" || reason === "death" || reason === "removed") {
                  this.generation++;
                  this.triggered = false;
            }
      }
}
