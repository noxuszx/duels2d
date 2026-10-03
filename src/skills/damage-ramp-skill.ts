import type { CancellationReason } from "../gameplay/action-scope";
import type { FighterRuntimeComponent } from "../gameplay/fighter-runtime";
import { assertDamageRampSettings, type DamageRampSettings } from "../behaviors/settings";

export interface DamageRampSkillOptions {
      /** Whether charging may advance on this simulation tick. */
      enabled: () => boolean;
      /** Called for each increase with its value and scheduled age in simulation ms. */
      onIncrease?: (value: number, ageMs: number) => void;
      /** Called once when the configured cap is reached. */
      onCap?: (value: number, ageMs: number) => void;
}

/** Simulation-timed arithmetic ramp; character decisions stay with its owner. */
export class DamageRampSkill implements FighterRuntimeComponent {
      private value = 0;
      private age = 0;
      private nextIncrease = 0;
      private capped = false;
      private closed = false;
      private revision = 0;

      constructor(
            private readonly settings: DamageRampSettings,
            private readonly options: DamageRampSkillOptions,
      ) {
            assertDamageRampSettings(settings);
            this.restart();
      }

      get accumulatedDamage(): number { return this.value; }
      get ageMs(): number { return this.age; }

      update(deltaMs: number): void {
            if (this.closed || this.capped || !this.options.enabled() || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
            const revision = this.revision;
            this.age += deltaMs;
            while (!this.capped && this.age + 1e-7 >= this.nextIncrease) {
                  const increaseAt = this.nextIncrease;
                  this.value = Math.min(this.settings.maxDamage, this.value + this.settings.amountPerIncrease);
                  this.options.onIncrease?.(this.value, increaseAt);
                  if (revision !== this.revision || this.closed) return;
                  if (this.value >= this.settings.maxDamage) {
                        this.capped = true;
                        this.options.onCap?.(this.value, increaseAt);
                        if (revision !== this.revision || this.closed) return;
                        break;
                  }
                  const second = Math.floor((increaseAt + 1e-7) / 1000);
                  const rate = this.settings.ratesPerSecond[Math.min(second, this.settings.ratesPerSecond.length - 1)];
                  this.nextIncrease += 1000 / rate;
            }
      }

      /** Restarts the schedule while retaining the current accumulated value. */
      restart(): void {
            if (this.closed) return;
            this.revision++;
            this.age = 0;
            this.capped = this.value >= this.settings.maxDamage;
            this.nextIncrease = 1000 / this.settings.ratesPerSecond[0];
      }

      /** Clears accumulated value and starts a fresh schedule. */
      clear(): void {
            if (this.closed) return;
            this.value = 0;
            this.restart();
      }

      cancel(reason: CancellationReason): void {
            if (reason === "death" || reason === "reset" || reason === "removed") this.clear();
            if (reason === "removed") this.closed = true;
      }
}
