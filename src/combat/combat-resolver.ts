import { areEnemies } from "../gameplay/teams";
import type { Fighter } from "../entities/fighter";
import type { IndicatorSystem } from "../systems/indicator-system";
import type { DamageResult } from "./combat-result";

export interface ApplyDamageOptions {
      source?: Fighter | null;
      target: Fighter;
      amount: number;
      nowMs: number;
      cooldownMs: number;
      /** Caller owns per-attack/per-target timing instead of the fighter collision cooldown. */
      independentCooldown?: boolean;
      indicators: IndicatorSystem;
}

/** Applies damage and its shared feedback after the caller has determined its amount. */
export function applyDamage({
      source = null,
      target,
      amount,
      nowMs,
      cooldownMs,
      independentCooldown = false,
      indicators,
}: ApplyDamageOptions): DamageResult {
      if (source && !areEnemies(source, target)) return { applied: false, actualDamage: 0, killed: false };
      const healthBefore = target.currentHealth;
      const applied = target.takeDamage(amount, nowMs, cooldownMs, independentCooldown);
      if (!applied) return { applied: false, actualDamage: 0, killed: false };

      const healthAfter = target.currentHealth;
      const actualDamage = Number.isFinite(healthBefore) && Number.isFinite(healthAfter)
            ? Math.max(0, healthBefore - healthAfter)
            : amount;

      target.playSound("hurt");
      indicators.spawnDamageIndicator(target, actualDamage);
      indicators.spawnHitSpark(target.body.position, target.config.color);
      if (source) indicators.spawnCharacterLine(source, "weaponHit");

      if (actualDamage > 0) target.behavior?.onDamaged(actualDamage, source);

      return {
            applied: true,
            actualDamage,
            killed: target.isDead,
      };
}
