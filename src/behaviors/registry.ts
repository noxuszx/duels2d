import type { Fighter } from "../entities/fighter";
import { DefaultFighterBehavior, type StandardAbilityHandler } from "./default-behavior";
import { FighterBehavior } from "./fighter-behavior";
import { BabyManBehavior } from "./fighters/babyman.behavior";
import { AngryManBehavior } from "./fighters/angryman.behavior";
import { ChefManBehavior } from "./fighters/chefman.behavior";
import { DepressedManBehavior } from "./fighters/depressedman.behavior";
import { HappyManBehavior } from "./fighters/happyman.behavior";
import { WomanManBehavior } from "./fighters/womanman.behavior";
import type { FighterBehaviorContext } from "./types";

export type FighterBehaviorConstructor = new (
      fighter: Fighter,
      context: FighterBehaviorContext,
) => FighterBehavior;

const BEHAVIOR_REGISTRY = new Map<string, FighterBehaviorConstructor>([
      ["babyman", BabyManBehavior],
      ["angryman", AngryManBehavior],
      ["chefman", ChefManBehavior],
      ["depressedman", DepressedManBehavior],
      ["happyman", HappyManBehavior],
      ["womanman", WomanManBehavior],
]);

/**
 * Registers a custom behavior class for a specific fighter ID.
 */
export function registerFighterBehavior(
      id: string,
      constructor: FighterBehaviorConstructor,
): void {
      BEHAVIOR_REGISTRY.set(id, constructor);
}

/**
 * Creates the appropriate behavior instance for a fighter.
 * If a custom behavior is registered for the fighter's ID, it instantiates it.
 * Otherwise, it falls back to DefaultFighterBehavior for standard JSON abilities.
 */
export function createFighterBehavior(
      fighter: Fighter,
      context: FighterBehaviorContext,
      standardHandler: StandardAbilityHandler,
): FighterBehavior {
      const CustomBehavior = BEHAVIOR_REGISTRY.get(fighter.id);
      if (CustomBehavior) {
            return new CustomBehavior(fighter, context);
      }
      return new DefaultFighterBehavior(fighter, context, standardHandler);
}
