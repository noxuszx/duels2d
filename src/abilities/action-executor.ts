import type * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { AbilityAction, AbilityConfig } from "./types";
import {
      executeDamageAction,
      executeKnockbackAction,
      executeDashAction,
      executeProjectileAction,
      type ActionExecutionContext,
} from "./actions";

export interface ActionExecutorContext extends ActionExecutionContext {}

/** Coordinates the execution of modular ability actions (damage, knockback, dash, projectile). */
export class ActionExecutor {
      constructor(private readonly context: ActionExecutorContext) {}

      executeTargetActions(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
      ): boolean {
            let connected = false;
            for (const action of ability.actions) {
                  if (action.type === "damage") {
                        connected =
                              executeDamageAction(
                                    action,
                                    source,
                                    target,
                                    this.context,
                              ) || connected;
                  } else if (action.type === "knockback") {
                        executeKnockbackAction(action, source, target);
                        connected = true;
                  }
            }
            return connected;
      }

      executeProjectileAction(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
            action: Extract<AbilityAction, { type: "spawn-projectile" }>,
      ): void {
            executeProjectileAction(
                  action,
                  source,
                  target,
                  ability,
                  this.context,
            );
      }

      applyDash(
            source: Fighter,
            direction: Matter.Vector,
            action: Extract<AbilityAction, { type: "dash" }>,
      ): void {
            executeDashAction(action, source, direction);
      }
}
