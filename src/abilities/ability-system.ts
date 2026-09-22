import * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import { ActionExecutor } from "./action-executor";
import { enemyInRange, nearestEnemy, selectTarget } from "./targeting";
import type { AbilityAction, AbilityConfig } from "./types";

interface AbilitySystemGameManager {
      characters: Fighter[];
      projectiles: Projectile[];
      world: Matter.World;
      COLLISION_COOLDOWN: number;
      indicators: IndicatorSystem;
}

export class AbilitySystem {
      private readonly targets = new Map<Fighter, Fighter>();
      private readonly dashDirections = new Map<Fighter, Matter.Vector>();
      private readonly dashHits = new Set<Fighter>();
      private readonly swingHits = new Set<Fighter>();
      private readonly actions: ActionExecutor;

      constructor(private readonly gm: AbilitySystemGameManager) {
            this.actions = new ActionExecutor(gm);
      }

      update(): void {
            const now = performance.now();
            for (const fighter of this.gm.characters) {
                  const previousState = fighter.abilities.state;
                  fighter.abilities.update();
                  const ability = fighter.abilities.active;

                  if (
                        ability &&
                        previousState === "windup" &&
                        fighter.abilities.state === "active"
                  ) {
                        const target = this.targets.get(fighter);
                        const swing = this.action<"swing">(ability, "swing");
                        if (
                              swing &&
                              target &&
                              !target.isDead &&
                              !this.swingHits.has(fighter)
                        ) {
                              this.actions.executeTargetActions(
                                    fighter,
                                    target,
                                    ability,
                              );
                              fighter.playSound("weaponSlap");
                              this.swingHits.add(fighter);
                        }
                        if (target && !target.isDead)
                              this.dashDirections.set(fighter, {
                                    x:
                                          target.body.position.x -
                                          fighter.body.position.x,
                                    y:
                                          target.body.position.y -
                                          fighter.body.position.y,
                              });
                  }

                  if (ability && fighter.abilities.state === "active") {
                        const dash = this.action<"dash">(ability, "dash");
                        const direction = this.dashDirections.get(fighter);
                        if (dash && direction)
                              this.actions.applyDash(fighter, direction, dash);

                        const target = this.targets.get(fighter);
                        if (
                              dash &&
                              target &&
                              !this.dashHits.has(fighter) &&
                              enemyInRange(fighter, [target], 0)
                        )
                              this.tryApplyDashHit(fighter, target);
                  }

                  if (fighter.abilities.state === "idle")
                        this.clearRuntime(fighter);
                  if (fighter.isDead || fighter.abilities.state !== "idle")
                        continue;

                  const activation = fighter.config.abilities
                        .filter((candidate) =>
                              fighter.abilities.canUse(candidate, now),
                        )
                        .map((candidate) => ({
                              ability: candidate,
                              target: selectTarget(
                                    fighter,
                                    this.gm.characters,
                                    candidate.trigger,
                              ),
                        }))
                        .find((candidate) => candidate.target !== null);
                  if (activation?.target)
                        this.activate(
                              fighter,
                              activation.target,
                              activation.ability,
                              now,
                        );
            }
      }

      updateFaceTargeting(): void {
            for (const fighter of this.gm.characters) {
                  if (fighter.isDead) continue;
                  const mode = fighter.config.faceTarget?.mode ?? "never";
                  if (mode === "always")
                        fighter.setFacingToward(
                              nearestEnemy(fighter, this.gm.characters),
                        );
                  else if (mode === "range") {
                        const rangeAbility = fighter.config.abilities.find(
                              (ability) =>
                                    ability.trigger.type === "enemy-in-range",
                        );
                        const target = rangeAbility
                              ? enemyInRange(
                                      fighter,
                                      this.gm.characters,
                                      rangeAbility.trigger.type ===
                                            "enemy-in-range"
                                            ? rangeAbility.trigger.rangePadding
                                            : 0,
                                )
                              : null;
                        if (target) fighter.setFacingToward(target);
                        else fighter.facing = fighter.config.defaultFacing;
                  } else fighter.facing = fighter.config.defaultFacing;
            }
      }

      handleCharacterCollision(first: Fighter, second: Fighter): void {
            this.tryApplyDashHit(first, second);
            this.tryApplyDashHit(second, first);
            this.finishCollisionDash(first, "fighter-collision");
            this.finishCollisionDash(second, "fighter-collision");
      }

      handleWallCollision(fighter: Fighter): void {
            this.finishCollisionDash(fighter, "wall-collision");
      }

      private activate(
            fighter: Fighter,
            target: Fighter,
            ability: AbilityConfig,
            nowMs: number,
      ): void {
            fighter.abilities.start(ability, fighter.facing, nowMs);
            fighter.abilities.lockFacingToward(
                  target.body.position.x,
                  fighter.body.position.x,
            );
            this.targets.set(fighter, target);
            const projectile = this.action<"spawn-projectile">(
                  ability,
                  "spawn-projectile",
            );
            if (projectile)
                  this.actions.executeProjectileAction(
                        fighter,
                        target,
                        projectile,
                  );

            const dash = this.action<"dash">(ability, "dash");
            if (dash) fighter.playSound("weaponSlap");
            else if (!projectile && !this.action(ability, "swing")) {
                  this.actions.executeTargetActions(fighter, target, ability);
                  fighter.playSound("weaponSlap");
            }
      }

      private tryApplyDashHit(attacker: Fighter, target: Fighter): void {
            const ability = attacker.abilities.active;
            if (
                  !ability ||
                  attacker.abilities.state !== "active" ||
                  !this.action(ability, "dash") ||
                  attacker.isDead ||
                  target.isDead ||
                  this.dashHits.has(attacker)
            )
                  return;
            this.actions.executeTargetActions(attacker, target, ability);
            this.dashHits.add(attacker);
      }

      private finishCollisionDash(
            fighter: Fighter,
            event: "fighter-collision" | "wall-collision",
      ): void {
            const ability = fighter.abilities.active;
            const dash = ability ? this.action<"dash">(ability, "dash") : null;
            if (
                  fighter.abilities.state === "active" &&
                  dash?.endOn.includes(event)
            )
                  fighter.abilities.finishActive();
      }

      private clearRuntime(fighter: Fighter): void {
            this.targets.delete(fighter);
            this.dashDirections.delete(fighter);
            this.dashHits.delete(fighter);
            this.swingHits.delete(fighter);
      }

      private action<T extends AbilityAction["type"]>(
            ability: AbilityConfig,
            type: T,
      ): Extract<AbilityAction, { type: T }> | null {
            return (
                  (ability.actions.find(
                        (action) => action.type === type,
                  ) as Extract<AbilityAction, { type: T }>) ?? null
            );
      }
}
