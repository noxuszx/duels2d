import type { Fighter } from "../../entities/fighter";
import type { DamageAction } from "../types";
import type { ActionExecutionContext } from "./types";

/** Executes direct damage against a target fighter with audio, sparks, and indicators. */
export function executeDamageAction(
      action: DamageAction,
      source: Fighter,
      target: Fighter,
      context: ActionExecutionContext,
      nowMs = Date.now(),
): boolean {
      const didDamage = target.takeDamage(
            action.amount,
            nowMs,
            context.COLLISION_COOLDOWN,
      );
      if (!didDamage) return false;

      target.playSound("hurt");
      context.indicators.spawnDamageIndicator(target, action.amount);
      context.indicators.spawnHitSpark(
            target.body.position,
            target.config.color,
      );
      context.indicators.spawnCharacterLine(source, "weaponHit");
      return true;
}
