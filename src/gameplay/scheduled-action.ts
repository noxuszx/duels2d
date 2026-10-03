import type { CancellationReason } from "./action-scope";
import type { FighterRuntimeComponent } from "./fighter-runtime";

export interface ScheduledActionOptions {
      delayMs: number;
      intervalMs: number;
      limit: number;
      /** False leaves the same attempt pending; only accepted actions consume the limit. */
      action: () => boolean;
}

/** A finite sequence of simulation deadlines, explicitly started by a character decision. */
export class ScheduledAction implements FighterRuntimeComponent {
      private nextAt: number | null = null;
      private completed = 0;
      private generation = 0;

      constructor(
            private readonly now: () => number,
            private readonly options: ScheduledActionOptions,
      ) {
            if (!Number.isFinite(options.delayMs) || options.delayMs < 0 ||
                  !Number.isFinite(options.intervalMs) || options.intervalMs <= 0 ||
                  !Number.isInteger(options.limit) || options.limit < 0)
                  throw new Error("Invalid scheduled action settings");
      }

      start(): void {
            this.generation++;
            this.completed = 0;
            this.nextAt = this.options.limit > 0 ? this.now() + this.options.delayMs : null;
      }

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.nextAt === null || this.now() < this.nextAt) return;
            const deadline = this.nextAt;
            const generation = this.generation;
            if (!this.options.action() || this.generation !== generation) return;
            this.completed++;
            this.nextAt = this.completed < this.options.limit ? deadline + this.options.intervalMs : null;
      }

      /** Status interruptions preserve the schedule. Reset/death/removal discard it. */
      cancel(reason: CancellationReason): void {
            if (reason === "interrupted" || reason === "phase-ended") return;
            this.generation++;
            this.nextAt = null;
            this.completed = 0;
      }
}
