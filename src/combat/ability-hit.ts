import { areEnemies } from "../gameplay/teams";
import type { AbilityConfig } from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import type { FighterBehaviorContext } from "../behaviors/types";
import type { CombatResult } from "./combat-result";

/** Script-facing bridge to configured effects and successful-hit audio. */
export function hitWithAbility(
      source: Fighter,
      target: Fighter,
      ability: AbilityConfig,
      context: Pick<FighterBehaviorContext, "characters" | "executeTargetActions">,
): CombatResult | null {
      if (source.isDead || target.isDead || !areEnemies(source, target) || !context.characters.includes(target)) return null;
      const result = context.executeTargetActions(source, target, ability);
      if (result.connected) source.audio.playAbilityCue(ability, "hit");
      return result;
}
