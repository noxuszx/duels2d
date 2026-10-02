import * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import { ActionExecutor } from "./action-executor";
import { DashSkill } from "../skills/dash-skill";
import { attackHitboxOverlaps } from "./actions/attack-hitbox-action";
import type { ArenaBounds, ArenaWall } from "../skills/types";
import { enemyInRange, nearestEnemy, selectTarget } from "./targeting";
import type { AbilityAction, AbilityConfig } from "./types";
import { createFighterBehavior } from "../behaviors/registry";
import type { StandardAbilityHandler } from "../behaviors/default-behavior";
import {
      DEFAULT_WALL_COLLISION_RESPONSE,
      type FighterBehaviorContext,
      type WallCollisionResponse,
} from "../behaviors/types";

interface AbilitySystemGameManager {
      characters: Fighter[];
      projectiles: Projectile[];
      world: Matter.World;
      COLLISION_COOLDOWN: number;
      indicators: IndicatorSystem;
      ARENA_BORDER: number;
      now(): number;
      isGameOver?(): boolean;
}

export class AbilitySystem implements StandardAbilityHandler {
      private readonly targets = new Map<Fighter, Fighter>();
      // Legacy JSON adapter: shares DashSkill with scripted moves and Baby Man.
      private readonly dashes = new Map<Fighter, DashSkill>();
      private readonly swingHits = new Set<Fighter>();
      private readonly attackHitTargets = new Map<Fighter, Set<Fighter>>();
      private readonly actions: ActionExecutor;

      constructor(private readonly gm: AbilitySystemGameManager) {
            this.actions = new ActionExecutor(gm);
      }

      private getBehaviorContext(): FighterBehaviorContext {
            const gm = this.gm;
            return {
                  get characters() { return gm.characters; },
                  world: this.gm.world,
                  addProjectile: (projectile) => {
                        this.gm.projectiles.push(projectile);
                        Matter.World.add(this.gm.world, projectile.body);
                  },
                  now: () => this.gm.now(),
                  isCombatActive: () => !this.gm.isGameOver?.(),
                  getNearestEnemy: (source) =>
                        nearestEnemy(source, this.gm.characters),
                  executeTargetActions: (source, target, ability) =>
                        this.actions.executeTargetActions(
                              source,
                              target,
                              ability,
                        ),
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
                  if (fighter.isDead) fighter.statuses.clear();
                  else {
                        fighter.statuses.update(deltaMs);
                        fighter.updateTransformation(deltaMs);
                  }
                  this.ensureBehavior(fighter);
                  fighter.behavior?.onUpdate(deltaMs);
                  const aimTarget = this.targets.get(fighter);
                  fighter.updateAim?.(aimTarget && !aimTarget.isDead
                        ? aimTarget : nearestEnemy(fighter, this.gm.characters));
            }
      }

      /** Standard JSON ability tick for fighters without custom scripts (DefaultFighterBehavior). */
      updateStandardFighter(fighter: Fighter, deltaMs: number): void {
            if (this.gm.isGameOver?.()) return;
            const now = this.gm.now();
            if (fighter.isDead) {
                  fighter.abilities.reset();
                  this.clearRuntime(fighter);
                  return;
            }

            this.advanceStandardMove(fighter, deltaMs);
            if (fighter.isDead || fighter.abilities.state !== "idle") return;

            const activations = fighter.activeAbilities
                  .filter((candidate) =>
                        candidate.trigger.type !== "wall-contact",
                  )
                  .map((candidate) => ({
                        ability: candidate,
                        target: selectTarget(
                              fighter,
                              this.gm.characters,
                              candidate.trigger,
                              this.action<"attack-hitbox">(candidate, "attack-hitbox") ?? undefined,
                        ),
                  }));
            for (const activation of activations) {
                  if (!activation.target) continue;
                  if (
                        this.activate(
                              fighter,
                              activation.target,
                              activation.ability,
                              now,
                        )
                  )
                        break;
            }
      }

      /** Legacy adapter: component ticks get only the time consumed in their active phase. */
      private advanceStandardMove(fighter: Fighter, deltaMs: number): void {
            fighter.abilities.update(deltaMs, {
                  transition: () => {
                        const ability = fighter.abilities.active;
                        if (ability && fighter.abilities.state === "active") this.enterStandardActive(fighter, ability);
                  },
                  tick: (phase, elapsedMs) => {
                        const ability = fighter.abilities.active;
                        if (phase !== "active" || !ability) return;
                        this.applyAttackHitbox(fighter, ability);
                        const dash = this.dashes.get(fighter);
                        dash?.update(elapsedMs);
                        const target = this.targets.get(fighter);
                        if (dash && target && enemyInRange(fighter, [target], 0)) dash.handleFighterCollision(target);
                  },
            });
            if (fighter.abilities.state !== "active") {
                  this.dashes.get(fighter)?.cancel("phase-ended");
                  this.dashes.delete(fighter);
            }
            if (fighter.abilities.state === "idle") this.clearRuntime(fighter);
      }

      private enterStandardActive(fighter: Fighter, ability: AbilityConfig): void {
            const target = this.targets.get(fighter);
            const activeTarget = target && !target.isDead
                  ? target
                  : nearestEnemy(fighter, this.gm.characters);
            if (activeTarget) {
                  fighter.updateAim?.(activeTarget);
                  this.actions.executeActiveEntryActions(
                        fighter,
                        activeTarget,
                        ability,
                  );
            }
            const swing = this.action<"swing">(
                  ability,
                  "swing",
            );
            const attackHitbox = this.action<"attack-hitbox">(
                  ability,
                  "attack-hitbox",
            );
            if (
                  swing &&
                  !attackHitbox &&
                  target &&
                  !target.isDead &&
                  !this.swingHits.has(fighter)
            ) {
                  if (this.actions.executeTargetActions(fighter, target, ability).connected)
                        fighter.audio.playAbilityCue(
                              ability,
                              "hit",
                        );
                  this.swingHits.add(fighter);
            }
            const hasDeliveryAction = ability.actions.some(
                  (action) =>
                        action.type === "dash" ||
                        action.type === "spawn-projectile" ||
                        action.type === "swing" ||
                        action.type === "attack-hitbox" ||
                        action.type === "wall-crawl",
            );
            if (!hasDeliveryAction && activeTarget) {
                  if (
                        this.actions.executeTargetActions(
                              fighter,
                              activeTarget,
                              ability,
                        ).connected
                  ) {
                        fighter.audio.playAbilityCue(
                              ability,
                              "hit",
                        );
                  }
            }
            if (attackHitbox) this.applyAttackHitbox(fighter, ability);
            const dashAction = this.action<"dash">(ability, "dash");
            if (dashAction && activeTarget && fighter.abilities.state === "active") {
                  const dash = new DashSkill();
                  this.dashes.set(fighter, dash);
                  const started = dash.startToward(fighter, activeTarget, {
                        speedMultiplier: dashAction.speedMultiplier,
                        accelerationForce: dashAction.accelerationForce,
                        stopOn: dashAction.endOn,
                        onHitEnemy: (enemy) => {
                              if (this.dashes.get(fighter) !== dash || fighter.abilities.active !== ability ||
                                    fighter.isDead || enemy.isDead || !this.gm.characters.includes(enemy)) return;
                              if (this.actions.executeTargetActions(fighter, enemy, ability).connected)
                                    fighter.audio.playAbilityCue(ability, "hit");
                        },
                        onComplete: () => {
                              if (this.dashes.get(fighter) !== dash || fighter.abilities.active !== ability ||
                                    fighter.abilities.state !== "active" || fighter.isDead) return;
                              fighter.abilities.finishActive();
                              fighter.abilities.update(0);
                        },
                  });
                  if (!started) { fighter.abilities.finishActive(); fighter.abilities.update(0); }
            }
      }

      /** StandardAbilityHandler implementation */
      onWallCollision(fighter: Fighter, wall: ArenaWall): WallCollisionResponse {
            if (this.gm.isGameOver?.()) return DEFAULT_WALL_COLLISION_RESPONSE;
            this.dashes.get(fighter)?.handleWallCollision(wall);
            return DEFAULT_WALL_COLLISION_RESPONSE;
      }

      /** StandardAbilityHandler implementation */
      onFighterCollision(fighter: Fighter, target: Fighter): void {
            this.dashes.get(fighter)?.handleFighterCollision(target);
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
                  if (fighter.aimSkill && fighter.activeSkills?.aim) {
                        fighter.setFacingToward(this.targets.get(fighter) ?? nearestEnemy(fighter, this.gm.characters));
                        fighter.updateAim(this.targets.get(fighter) ?? nearestEnemy(fighter, this.gm.characters));
                        continue;
                  }
                  const mode = fighter.config.faceTarget?.mode ?? "never";
                  if (mode === "always")
                        fighter.setFacingToward(
                              nearestEnemy(fighter, this.gm.characters),
                        );
                  else if (mode === "range") {
                        const rangeAbility = fighter.activeAbilities.find(
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
            wasDashing: boolean,
      ): WallCollisionResponse {
            this.ensureBehavior(fighter);
            const response = fighter.behavior?.onWallCollision(wall, bounds);
            if (!response) {
                  return { defaultBounce: true, allowImpactDamage: !wasDashing };
            }
            return wasDashing
                  ? { ...response, allowImpactDamage: false }
                  : response;
      }

      private activate(
            fighter: Fighter,
            target: Fighter,
            ability: AbilityConfig,
            nowMs: number,
      ): boolean {
            const result = fighter.abilities.tryStart(
                  ability,
                  fighter.facing,
                  nowMs,
            );
            if (!result.started) return false;
            fighter.abilities.lockFacingToward(
                  target.body.position.x,
                  fighter.body.position.x,
            );
            this.targets.set(fighter, target);
            this.advanceStandardMove(fighter, 0);
            return true;
      }

      private applyAttackHitbox(fighter: Fighter, ability: AbilityConfig): void {
            const action = this.action<"attack-hitbox">(
                  ability,
                  "attack-hitbox",
            );
            if (!action) return;
            let hitTargets = this.attackHitTargets.get(fighter);
            if (!hitTargets) {
                  hitTargets = new Set();
                  this.attackHitTargets.set(fighter, hitTargets);
            }
            for (const target of this.gm.characters) {
                  if (
                        target === fighter ||
                        target.isDead ||
                        hitTargets.has(target) ||
                        !attackHitboxOverlaps(fighter, target, action)
                  ) {
                        continue;
                  }
                  if (
                        this.actions.executeTargetActions(fighter, target, ability)
                              .connected
                  ) {
                        fighter.audio.playAbilityCue(ability, "hit");
                  }
                  hitTargets.add(target);
            }
      }

      private clearRuntime(fighter: Fighter): void {
            this.targets.delete(fighter);
            this.dashes.get(fighter)?.cancel("interrupted");
            this.dashes.delete(fighter);
            this.swingHits.delete(fighter);
            this.attackHitTargets.delete(fighter);
      }

      resetAll(): void {
            for (const fighter of this.gm.characters) {
                  fighter.statuses.clear();
                  fighter.resetTransformation();
                  fighter.behavior?.reset();
                  fighter.abilities.reset();
                  fighter.aimSkill?.stop();
            }
            this.targets.clear();
            for (const dash of this.dashes.values()) dash.cancel("reset");
            this.dashes.clear();
            this.swingHits.clear();
            this.attackHitTargets.clear();
      }

      isDashing(fighter: Fighter): boolean {
            const scripted = fighter.behavior?.isDashing?.();
            if (scripted != null) return scripted;
            return (
                  fighter.abilities.state === "active" &&
                  (this.dashes.get(fighter)?.isActive ||
                        Boolean(
                              fighter.abilities.active?.actions.some(
                                    (a) => a.type === "dash",
                              ),
                        ))
            );
      }

      isStandardDashing(fighter: Fighter): boolean {
            return fighter.abilities.state === "active" && !!this.dashes.get(fighter)?.isActive;
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
