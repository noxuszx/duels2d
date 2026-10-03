import { areEnemies } from "../gameplay/teams";
import type { Fighter } from "../entities/fighter";
import type { AbilityAction, AbilityConfig } from "./types";
import type { CombatResult } from "../combat/combat-result";
import type { StatusEffectId } from "../status-effects";
import {
      executeDamageAction,
      executeKnockbackAction,
      executeProjectileAction,
      executeRecoilAction,
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
      ): CombatResult {
            if (this.context.isGameOver?.() || source.isDead || target.isDead || !areEnemies(source, target)) return {
                  connected: false, damageApplied: 0, knockbackApplied: false, statusesApplied: [],
            };
            let damageApplied = 0;
            let damageConnected = false;
            let knockbackApplied = false;
            const statusActions = ability.actions.filter(
                  (action) => action.type === "apply-status",
            );
            const hasDamageOrKnockback = ability.actions.some(
                  (action) => action.type === "damage" || action.type === "knockback",
            );
            for (const action of ability.actions) {
                  if (action.type === "damage") {
                        const result = executeDamageAction(
                              action,
                              source,
                              target,
                              this.context,
                        );
                        if (result.applied) {
                              damageConnected = true;
                              damageApplied += result.actualDamage;
                        }
                  } else if (action.type === "knockback") {
                        executeKnockbackAction(
                              action,
                              source,
                              target,
                              undefined,
                              this.context.now(),
                        );
                        knockbackApplied = true;
                  }
            }
            const statusesApplied: StatusEffectId[] = [];
            const targetActionConnected = damageConnected || knockbackApplied;
            if (targetActionConnected || !hasDamageOrKnockback) {
                  for (const action of statusActions) {
                        if (action.type !== "apply-status") continue;
                        const result = target.applyStatus({
                              effect: action.effect,
                              durationMs: action.durationMs,
                              sourceId: source.runtimeId,
                        });
                        if (result.applied && !statusesApplied.includes(action.effect))
                              statusesApplied.push(action.effect);
                  }
            }
            return {
                  connected: damageConnected || knockbackApplied || statusesApplied.length > 0,
                  damageApplied,
                  knockbackApplied,
                  statusesApplied,
            };
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

      /** Executes source-side actions exactly once when an ability becomes active. */
      executeActiveEntryActions(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
      ): void {
            if (this.context.isGameOver?.()) return;
            const dx = target.body.position.x - source.body.position.x;
            const dy = target.body.position.y - source.body.position.y;
            const length = Math.hypot(dx, dy) || 1;
            const firingDirection = source.aimSkill?.current?.direction ?? { x: dx / length, y: dy / length };

            for (const action of ability.actions) {
                  if (action.type === "spawn-projectile") {
                        this.executeProjectileAction(source, target, ability, action);
                  } else if (action.type === "recoil") {
                        executeRecoilAction(
                              action,
                              source,
                              firingDirection,
                              this.context.now(),
                        );
                  }
            }
      }

}
