import type { Fighter } from "../entities/fighter";
import { FighterBehavior } from "./fighter-behavior";
import type { ArenaBounds, ArenaWall, FighterBehaviorContext } from "./types";

export interface StandardAbilityHandler {
      updateStandardFighter(fighter: Fighter, deltaMs: number): void;
      onWallCollision(fighter: Fighter, wall: ArenaWall): boolean;
      onFighterCollision(fighter: Fighter, target: Fighter): void;
      reset(fighter: Fighter): void;
}

/**
 * Default behavior used by fighters configured purely through JSON
 * without a custom behavior script.
 * Delegates ability triggers, timing, and actions to the standard ability system.
 */
export class DefaultFighterBehavior extends FighterBehavior {
      constructor(
            fighter: Fighter,
            context: FighterBehaviorContext,
            private readonly standardHandler: StandardAbilityHandler,
      ) {
            super(fighter, context);
      }

      override onUpdate(deltaMs: number): void {
            this.standardHandler.updateStandardFighter(this.fighter, deltaMs);
      }

      override onWallCollision(wall: ArenaWall, bounds: ArenaBounds): boolean {
            void bounds;
            return this.standardHandler.onWallCollision(this.fighter, wall);
      }

      override onFighterCollision(target: Fighter): void {
            this.standardHandler.onFighterCollision(this.fighter, target);
      }

      override reset(): void {
            this.standardHandler.reset(this.fighter);
      }
}
