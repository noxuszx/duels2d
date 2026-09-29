import type { Fighter } from "../../entities/fighter";
import type { DamageAction } from "../types";
import type { ActionExecutionContext } from "./types";
import { applyDamage } from "../../combat/combat-resolver";
import type { DamageResult } from "../../combat/combat-result";

/** Executes direct damage against a target fighter with audio, sparks, and indicators. */
export function executeDamageAction(
      action: DamageAction,
      source: Fighter,
      target: Fighter,
      context: ActionExecutionContext,
): DamageResult {
      return applyDamage({
            source,
            target,
            amount: action.amount,
            nowMs: context.now(),
            cooldownMs: context.COLLISION_COOLDOWN,
            indicators: context.indicators,
      });
}
