import type { Fighter } from "../../entities/fighter";
import type { FighterBehaviorContext } from "../types";
import { ProjectileBehavior } from "../projectile-behavior";

export class DepressedManBehavior extends ProjectileBehavior {
      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }
}
