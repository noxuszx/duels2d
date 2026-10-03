import type { SaucerSettings } from "../gameplay/saucer-settings";

/** Values consumed by a damage-ramp behavior; timing is simulation milliseconds. */
export interface DamageRampSettings {
      amountPerIncrease: number;
      maxDamage: number;
      hurtThrowThreshold?: number;
      ratesPerSecond: number[];
      increasePoseMs: number;
}

/** Extend this discriminated union for concrete behavior needs, not an arbitrary settings bag. */
export interface AlienLaserSettings {
      damage: number;
      intervalMs: number;
      width: number;
      range: number;
      flashMs: number;
      color: string;
}

export type FighterBehaviorDefinition = {
      type: "damage-ramp";
      settings: DamageRampSettings;
} | { type: "alien-laser"; settings: AlienLaserSettings }
  | { type: "saucer-support"; settings: SaucerSettings };

/** Reject malformed authored tuning before it can create an unbounded ramp loop. */
export function assertDamageRampSettings(settings: DamageRampSettings): void {
      if (!settings || !Number.isFinite(settings.amountPerIncrease) || settings.amountPerIncrease <= 0 ||
            !Number.isFinite(settings.maxDamage) || settings.maxDamage <= 0 ||
            (settings.hurtThrowThreshold !== undefined &&
                  (!Number.isFinite(settings.hurtThrowThreshold) || settings.hurtThrowThreshold < 0 ||
                  settings.hurtThrowThreshold >= settings.maxDamage)) ||
            !Number.isFinite(settings.increasePoseMs) || settings.increasePoseMs < 0 ||
            !Array.isArray(settings.ratesPerSecond) || !settings.ratesPerSecond.length ||
            settings.ratesPerSecond.some(rate => !Number.isInteger(rate) || rate <= 0))
            throw new Error("Invalid damage-ramp behavior settings");
}
