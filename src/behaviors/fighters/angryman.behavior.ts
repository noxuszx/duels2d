import type { Fighter } from "../../entities/fighter";
import type { AbilityConfig } from "../../abilities/types";
import { AbilityRunner, type AbilityScript } from "../../gameplay/ability-runner";
import { AutoUseAbility } from "../../gameplay/auto-use-ability";
import { nearestEnemy } from "../../gameplay/targeting";
import { dashToward } from "../../gameplay/dash-move";
import { hitWithAbility } from "../../combat/ability-hit";
import { StopMovementSkill } from "../../skills/stop-movement-skill";
import { ShakeSkill } from "../../skills/shake-skill";
import type { FighterBehaviorContext } from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Stop and shake during windup, then charge and apply the configured hit effects. */
export class AngryManBehavior extends FighterBehavior {
      private readonly moves: AbilityRunner;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            this.moves = this.runtime.use(new AbilityRunner(fighter, context));
            this.runtime.use(new AutoUseAbility(this.moves, {
                  ability: () => fighter.activeAbilities.find(ability =>
                        ability.trigger.type === "nearest-enemy" &&
                        ability.actions.some(action => action.type === "dash") &&
                        this.moves.canStart(ability)) ?? null,
                  target: () => nearestEnemy(fighter, context.characters),
                  script: (target, ability) => this.charge(target, ability),
            }));
      }

      private charge(target: Fighter, ability: AbilityConfig): AbilityScript | null {
            const dash = ability.actions.find(action => action.type === "dash");
            if (!dash) return null;
            return {
                  windup: scope => {
                        scope.use(new StopMovementSkill(this.fighter.movement));
                        scope.use(new ShakeSkill(this.fighter));
                  },
                  active: scope => {
                        const currentTarget = this.moves.validTarget(target)
                              ? target : nearestEnemy(this.fighter, this.context.characters);
                        if (!currentTarget) return this.moves.cancel();
                        dashToward(scope, this.moves, currentTarget, dash,
                              enemy => hitWithAbility(this.fighter, enemy, ability, this.context));
                  },
            };
      }
}
