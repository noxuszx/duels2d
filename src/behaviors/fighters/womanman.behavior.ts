import type { Fighter } from "../../entities/fighter";
import type { FighterBehaviorContext } from "../types";
import { SwingBehavior } from "../swing-behavior";

export class WomanManBehavior extends SwingBehavior {
      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }
}
