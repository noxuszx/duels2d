import type { AbilityConfig } from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import type { AbilityRunner, AbilityScript } from "./ability-runner";
import type { CancellationReason } from "./action-scope";
import type { FighterRuntimeComponent } from "./fighter-runtime";

export interface AutoUseAbilityOptions {
      ability: AbilityConfig | (() => AbilityConfig | null);
      target: () => Fighter | null;
      script: (target: Fighter, ability: AbilityConfig) => AbilityScript | null;
      initialDelayMs?: number;
}

/** Repeatedly requests a configured move once its initial simulation delay has elapsed. */
export class AutoUseAbility implements FighterRuntimeComponent {
      private elapsedMs = 0;

      constructor(
            private readonly runner: AbilityRunner,
            private readonly options: AutoUseAbilityOptions,
      ) {}

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
            const delayMs = Number.isFinite(this.options.initialDelayMs)
                  ? Math.max(0, this.options.initialDelayMs ?? 0)
                  : 0;
            this.elapsedMs = Math.min(delayMs, this.elapsedMs + deltaMs);
            if (this.elapsedMs < delayMs) return;

            this.tryUse();
      }

      /** Attempts a request immediately without advancing the initial delay. */
      tryUse(): boolean {
            const delayMs = Number.isFinite(this.options.initialDelayMs)
                  ? Math.max(0, this.options.initialDelayMs ?? 0)
                  : 0;
            if (this.elapsedMs < delayMs) return false;

            const ability = typeof this.options.ability === "function"
                  ? this.options.ability()
                  : this.options.ability;
            if (!ability || !this.runner.canStart(ability)) return false;

            const target = this.options.target();
            if (!target || !this.runner.validTarget(target)) return false;
            const script = this.options.script(target, ability);
            if (!script) return false;
            return this.runner.start(ability, target, script).started;
      }

      /** Interruptions preserve the initial delay; reset and terminal lifecycle events restart it. */
      cancel(reason: CancellationReason): void {
            if (reason === "reset" || reason === "death" || reason === "removed") {
                  this.elapsedMs = 0;
            }
      }
}
