import * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import { ActionExecutor } from "./action-executor";
import type { ArenaBounds, ArenaWall } from "../skills/types";
import { enemyInRange, nearestEnemy, selectTarget } from "./targeting";
import type { AbilityAction, AbilityConfig } from "./types";
import { createFighterBehavior } from "../behaviors/registry";
import type { StandardAbilityHandler } from "../behaviors/default-behavior";
import type { FighterBehaviorContext } from "../behaviors/types";

interface AbilitySystemGameManager {
      characters: Fighter[];
      projectiles: Projectile[];
      world: Matter.World;
      COLLISION_COOLDOWN: number;
      indicators: IndicatorSystem;
      ARENA_BORDER: number;
      now(): number;
}

export class AbilitySystem implements StandardAbilityHandler {
      private readonly targets = new Map<Fighter, Fighter>();
      private readonly dashDirections = new Map<Fighter, Matter.Vector>();
      private readonly dashHits = new Set<Fighter>();
      private readonly swingHits = new Set<Fighter>();
      private readonly actions: ActionExecutor;

      constructor(private readonly gm: AbilitySystemGameManager) {
            this.actions = new ActionExecutor(gm);
      }

      private getBehaviorContext(): FighterBehaviorContext {
            return {
                  characters: this.gm.characters,
                  world: this.gm.world,
                  addProjectile: (projectile) => this.gm.projectiles.push(projectile),
                  now: () => this.gm.now(),
                  getNearestEnemy: (source) =>
                        nearestEnemy(source, this.gm.characters),
                  dealDamage: (source, target, amount) => {
                        const now = this.gm.now();
                        const dealt = target.takeDamage(
                              amount,
                              now,
                              this.gm.COLLISION_COOLDOWN,
                        );
                        if (dealt) {
                              target.playSound("hurt");
                              this.gm.indicators.spawnDamageIndicator(
                                    target,
                                    amount,
                              );
                              this.gm.indicators.spawnHitSpark(
                                    target.body.position,
                                    target.config.color,
                              );
                              this.gm.indicators.spawnCharacterLine(
                                    source,
                                    "weaponHit",
                              );
                        }
                        return dealt;
                  },
                  applyKnockback: (source, target, forceMagnitude) => {
                        target.applyForceKnockback(
                              {
                                    x:
                                          target.body.position.x -
                                          source.body.position.x,
                                    y:
                                          target.body.position.y -
                                          source.body.position.y,
                              },
                              forceMagnitude,
                              source.id,
                              this.gm.now(),
                        );
                  },
            };
      }

      private ensureBehavior(fighter: Fighter): void {
            if (!fighter.behavior) {
                  const context = this.getBehaviorContext();
                  fighter.behavior = createFighterBehavior(fighter, context, this);
            }
      }

      update(deltaMs: number): void {
            for (const fighter of this.gm.characters) {
                  this.ensureBehavior(fighter);
                  fighter.behavior?.onUpdate(deltaMs);
            }
      }

      /** Standard JSON ability tick for fighters without custom scripts (DefaultFighterBehavior). */
      updateStandardFighter(fighter: Fighter, deltaMs: number): void {
            void deltaMs;
            const now = this.gm.now();
            if (fighter.isDead) {
                  fighter.abilities.reset();
                  this.clearRuntime(fighter);
                  return;
            }

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
                        if (
                              this.actions.executeTargetActions(
                                    fighter,
                                    target,
                                    ability,
                              )
                        )
                              fighter.audio.playAbilityCue(
                                    ability,
                                    "hit",
                              );
                        this.swingHits.add(fighter);
                  }
                  const chargeTarget = target && !target.isDead
                        ? target
                        : nearestEnemy(fighter, this.gm.characters);
                  if (chargeTarget) {
                        const dx =
                              chargeTarget.body.position.x -
                              fighter.body.position.x;
                        const dy =
                              chargeTarget.body.position.y -
                              fighter.body.position.y;
                        this.dashDirections.set(fighter, { x: dx, y: dy });
                        if (dx !== 0) {
                              fighter.facing = dx < 0 ? "left" : "right";
                        }
                  }
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
                  ) {
                        this.tryApplyDashHit(fighter, target);
                        this.finishCollisionDash(fighter, "fighter-collision");
                  }
            }

            if (fighter.abilities.state === "idle")
                  this.clearRuntime(fighter);
            if (fighter.isDead || fighter.abilities.state !== "idle")
                  return;

            const activation = fighter.config.abilities
                  .filter((candidate) =>
                        candidate.trigger.type !== "wall-contact" &&
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

      /** StandardAbilityHandler implementation */
      onWallCollision(fighter: Fighter, wall: ArenaWall): boolean {
            void wall;
            this.finishCollisionDash(fighter, "wall-collision");
            return false;
      }

      /** StandardAbilityHandler implementation */
      onFighterCollision(fighter: Fighter, target: Fighter): void {
            this.tryApplyDashHit(fighter, target);
            this.finishCollisionDash(fighter, "fighter-collision");
      }

      /** StandardAbilityHandler implementation */
      reset(fighter: Fighter): void {
            this.clearRuntime(fighter);
      }

      updateFaceTargeting(): void {
            for (const fighter of this.gm.characters) {
                  if (
                        fighter.isDead ||
                        this.isWallCrawling(fighter) ||
                        this.isDashing(fighter)
                  )
                        continue;
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
            this.ensureBehavior(first);
            this.ensureBehavior(second);
            first.behavior?.onFighterCollision(second);
            second.behavior?.onFighterCollision(first);
      }

      isWallCrawling(fighter: Fighter): boolean {
            return fighter.behavior?.isWallCrawling() ?? false;
      }

      getWallCrawlAngle(fighter: Fighter): number | null {
            return fighter.behavior?.getWallCrawlAngle() ?? null;
      }

      getWeaponSwingAngle(fighter: Fighter): number | null {
            return fighter.behavior?.getWeaponSwingAngle() ?? fighter.abilities.getSwingAngle();
      }

      handleWallCollision(
            fighter: Fighter,
            wall: ArenaWall,
            bounds: ArenaBounds,
      ): boolean {
            this.ensureBehavior(fighter);
            return fighter.behavior?.onWallCollision(wall, bounds) ?? false;
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
                        ability,
                        projectile,
                  );

            const dash = this.action<"dash">(ability, "dash");
            if (!dash && !projectile && !this.action(ability, "swing"))
                  if (
                        this.actions.executeTargetActions(
                              fighter,
                              target,
                              ability,
                        )
                  )
                        fighter.audio.playAbilityCue(ability, "hit");
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
            if (
                  this.actions.executeTargetActions(attacker, target, ability)
            )
                  attacker.audio.playAbilityCue(ability, "hit");
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

      resetAll(): void {
            for (const fighter of this.gm.characters) {
                  fighter.behavior?.reset();
            }
            this.targets.clear();
            this.dashDirections.clear();
            this.dashHits.clear();
            this.swingHits.clear();
      }

      isDashing(fighter: Fighter): boolean {
            return (
                  fighter.abilities.state === "active" &&
                  (this.dashDirections.has(fighter) ||
                        Boolean(
                              fighter.abilities.active?.actions.some(
                                    (a) => a.type === "dash",
                              ),
                        ))
            );
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
