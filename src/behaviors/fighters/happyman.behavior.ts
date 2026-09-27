import type { Fighter } from "../../entities/fighter";
import type { FighterBehaviorContext } from "../types";
import { SwingBehavior } from "../swing-behavior";

export class HappyManBehavior extends SwingBehavior {
      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }
}
