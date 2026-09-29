import type { StatusEffectId } from "../status-effects";

/** Outcome of applying configured actions to a target fighter. */
export interface CombatResult {
      connected: boolean;
      damageApplied: number;
      knockbackApplied: boolean;
      statusesApplied: StatusEffectId[];
}

/** Outcome of attempting to apply damage to a fighter. */
export interface DamageResult {
      applied: boolean;
      actualDamage: number;
      killed: boolean;
}
