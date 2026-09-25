import * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import { ActionExecutor } from "./action-executor";
import {
      executeWallCrawlAction,
      getWallCrawlAngle,
      getWallCrawlFacing,
      startWallCrawl,
      type ArenaBounds,
      type ArenaWall,
      type WallCrawlState,
} from "./actions/wall-crawl-action";
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
      private readonly wallCrawls = new Map<Fighter, {
            state: WallCrawlState;
            bounds: ArenaBounds;
            elapsedMs: number;
      }>();
      private readonly actions: ActionExecutor;

      constructor(private readonly gm: AbilitySystemGameManager) {
            this.actions = new ActionExecutor(gm);
      }

      update(deltaMs: number): void {
            const now = performance.now();
            for (const fighter of this.gm.characters) {
                  if (fighter.isDead) {
                        fighter.abilities.reset();
                        this.clearRuntime(fighter);
                        continue;
                  }
                  const previousState = fighter.abilities.state;
                  const activeCrawl = this.wallCrawls.get(fighter);
                  if (activeCrawl && previousState === "windup") {
                        activeCrawl.elapsedMs += deltaMs;
                        const crawlAction = fighter.abilities.active
                              ? this.action<"wall-crawl">(fighter.abilities.active, "wall-crawl")
                              : null;
                        if (crawlAction && activeCrawl.elapsedMs >= crawlAction.durationMs)
                              fighter.abilities.beginActive();
                  } else {
                        fighter.abilities.update();
                  }
                  const ability = fighter.abilities.active;

                  if (ability && fighter.abilities.state === "windup") {
                        const crawl = this.action<"wall-crawl">(ability, "wall-crawl");
                        const runtime = this.wallCrawls.get(fighter);
                        if (crawl && runtime)
                              executeWallCrawlAction(
                                    crawl,
                                    fighter,
                                    runtime.state,
                                    runtime.bounds,
                              );
                  }

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
                        if (this.wallCrawls.has(fighter)) {
                              Matter.Body.setVelocity(fighter.body, { x: 0, y: 0 });
                              Matter.Body.setAngle(fighter.body, 0);
                              this.wallCrawls.delete(fighter);
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
                        continue;

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
      }

      isDashing(fighter: Fighter): boolean {
            return (
                  fighter.abilities.state === "active" &&
                  Boolean(fighter.abilities.active?.actions.some((a) => a.type === "dash"))
            );
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
            this.tryApplyDashHit(first, second);
            this.tryApplyDashHit(second, first);
            this.finishCollisionDash(first, "fighter-collision");
            this.finishCollisionDash(second, "fighter-collision");
      }

      isWallCrawling(fighter: Fighter): boolean {
            return this.wallCrawls.has(fighter);
      }

      getWallCrawlAngle(fighter: Fighter): number | null {
            const crawl = this.wallCrawls.get(fighter);
            return crawl ? getWallCrawlAngle(crawl.state.wall) : null;
      }

      handleWallCollision(
            fighter: Fighter,
            wall: ArenaWall,
            bounds: ArenaBounds,
      ): boolean {
            if (this.isWallCrawling(fighter)) return true;
            const wasCharging = fighter.abilities.state === "active" &&
                  fighter.abilities.active?.actions.some((action) => action.type === "dash");
            this.finishCollisionDash(fighter, "wall-collision");
            if (wasCharging) return false;
            if (fighter.isDead || fighter.abilities.state !== "idle") return false;
            const now = performance.now();
            const ability = fighter.config.abilities.find(
                  (candidate) =>
                        candidate.trigger.type === "wall-contact" &&
                        fighter.abilities.canUse(candidate, now),
            );
            const target = nearestEnemy(fighter, this.gm.characters);
            if (!ability || !target) return false;
            this.activate(fighter, target, ability, now);
            const crawlState = startWallCrawl(fighter, target, wall);
            fighter.facing = getWallCrawlFacing(
                  crawlState.wall,
                  crawlState.direction,
                  fighter.config.defaultFacing,
            );
            Matter.Body.setAngle(fighter.body, 0);
            this.wallCrawls.set(fighter, {
                  state: crawlState,
                  bounds,
                  elapsedMs: 0,
            });
            return true;
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
            this.wallCrawls.delete(fighter);
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
