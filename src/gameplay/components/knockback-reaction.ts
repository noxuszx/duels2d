import type { EntityComponent } from "../../engine/component";
import type { ComponentContext } from "../../engine/component";

/** Attack reactions temporarily yield upright control without changing collision policy. */
export class KnockbackReaction implements EntityComponent {
      private releaseUpright: (() => void) | null = null;
      private until = 0;

      constructor(private readonly context: ComponentContext, readonly durationMs = 750,
            readonly minimumForce = 0) {}

      knockedBack(force: number): void {
            if (!Number.isFinite(force) || force <= this.minimumForce) return;
            this.releaseUpright ??= this.context.entity.resources.acquireExclusive("upright");
            if (this.releaseUpright) this.until = this.context.simulation.nowMs + this.durationMs;
      }

      beforeStep(): void {
            if (this.context.simulation.nowMs >= this.until) this.cancel();
      }

      cancel(): void {
            this.releaseUpright?.();
            this.releaseUpright = null;
            this.until = 0;
      }
}
