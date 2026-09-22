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
      ): void {
            for (const action of ability.actions) {
                  if (action.type === "damage") {
                        executeDamageAction(action, source, target, this.context);
                  } else if (action.type === "knockback") {
                        executeKnockbackAction(action, source, target);
                  }
            }
      }

      executeProjectileAction(
            source: Fighter,
            target: Fighter,
            action: Extract<AbilityAction, { type: "spawn-projectile" }>,
      ): void {
            executeProjectileAction(action, source, target, this.context);
      }

      applyDash(
            source: Fighter,
            direction: Matter.Vector,
            action: Extract<AbilityAction, { type: "dash" }>,
      ): void {
            executeDashAction(action, source, direction);
      }
}
