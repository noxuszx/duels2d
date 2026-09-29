import { Body, Events, World, type Engine, type World as MatterWorld } from "matter-js";
import type { AbilitySystem } from "../abilities/ability-system";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import type { GameConfig } from "../types/game";
import { applyDamage } from "../combat/combat-resolver";

type Point = { x: number; y: number };
type Arena = { ax: number; ay: number; aw: number; ah: number };
type ImpactDamageSettings = {
      minSpeedMultiplier?: number;
      minSpeed?: number;
      damage?: number;
};

interface CombatHost {
      characters: Fighter[];
      projectiles: Projectile[];
      world: MatterWorld;
      now(): number;
      getArena(): Arena;
      isGameOver(): boolean;
}

/** Owns collision routing, arena containment, and impact/projectile damage. */
export class CombatSystem {
      constructor(
            private readonly engine: Engine,
            private readonly host: CombatHost,
            private readonly abilities: AbilitySystem,
            private readonly indicators: IndicatorSystem,
            private readonly gameConfig: GameConfig,
      ) { }

      register(): void {
            Events.on(this.engine, "collisionStart", (event) => {
                  if (this.host.isGameOver()) return;
                  const now = this.host.now();
                  for (const { bodyA, bodyB, collision } of event.pairs) {
                        const projectile = this.projectileFromBody(bodyA) ??
                              this.projectileFromBody(bodyB);
                        const first = this.fighterFromBody(bodyA);
                        const second = this.fighterFromBody(bodyB);
                        const fighter = first ?? second;
                        if (projectile && fighter) {
                              this.handleProjectileHit(projectile, fighter, now);
                              continue;
                        }
                        if (!first || !second || first === second) continue;
                        first.noteImpact(now);
                        second.noteImpact(now);
                        const firstWasDashing = this.abilities.isDashing(first);
                        const secondWasDashing = this.abilities.isDashing(second);
                        this.abilities.handleCharacterCollision(first, second);
                        this.handleFighterImpact(
                              first,
                              second,
                              now,
                              this.normalImpactSpeed(bodyA, bodyB, collision.normal),
                              firstWasDashing,
                              secondWasDashing,
                        );
                  }
            });

            Events.on(this.engine, "beforeUpdate", () => this.constrainFighters());
      }

      updateProjectiles(deltaMs: number): void {
            for (let i = this.host.projectiles.length - 1; i >= 0; i--) {
                  const projectile = this.host.projectiles[i];
                  projectile.update(deltaMs);
                  if (!projectile.expired) continue;
                  projectile.dead = true;
                  World.remove(this.host.world, projectile.body);
                  this.host.projectiles.splice(i, 1);
            }
      }

      private handleProjectileHit(
            projectile: Projectile,
            fighter: Fighter,
            now: number,
      ): void {
            if (projectile.ownerId === fighter.id || projectile.dead) return;
            const owner = this.host.characters.find(
                  (candidate) => candidate.id === projectile.ownerId,
            ) ?? null;
            const result = applyDamage({
                  source: owner,
                  target: fighter,
                  amount: projectile.damage,
                  nowMs: now,
                  cooldownMs: this.gameConfig.physics.collisionCooldownMs,
                  indicators: this.indicators,
            });
            if (result.applied && owner && projectile.hitSoundCue) {
                  owner.audio.play(projectile.hitSoundCue);
            }
            projectile.dead = true;
            World.remove(this.host.world, projectile.body);
            const index = this.host.projectiles.indexOf(projectile);
            if (index !== -1) this.host.projectiles.splice(index, 1);
      }

      private constrainFighters(): void {
            const now = this.host.now();
            const { ax, ay, aw, ah } = this.host.getArena();
            const padding = this.gameConfig.arena.borderWidth;
            for (const fighter of this.host.characters) {
                  if (fighter.isDead) continue;
                  fighter.applyPendingForce();
                  if (
                        !this.abilities.isWallCrawling(fighter) &&
                        fighter.statuses.canUseMovement
                  ) {
                        fighter.applyCruiseForce();
                        fighter.applyUprightTorque(now);
                  }
                  this.constrainFighter(fighter, { ax, ay, aw, ah }, padding, now);
            }
      }

      private constrainFighter(
            fighter: Fighter,
            arena: Arena,
            padding: number,
            now: number,
      ): void {
            const { position } = fighter.body;
            const velocity = { ...fighter.body.velocity };
            const minX = arena.ax + fighter.hitbox.halfWidth + padding;
            const maxX = arena.ax + arena.aw - fighter.hitbox.halfWidth - padding;
            const minY = arena.ay + fighter.hitbox.halfHeight + padding;
            const maxY = arena.ay + arena.ah - fighter.hitbox.halfHeight - padding;
            let correctedX = position.x;
            let correctedY = position.y;
            let hitHorizontal = false;
            let hitVertical = false;
            let impactSpeed = 0;

            if (position.x < minX) {
                  correctedX = minX;
                  impactSpeed = Math.max(impactSpeed, Math.abs(velocity.x));
                  velocity.x = Math.abs(velocity.x);
                  hitVertical = true;
            } else if (position.x > maxX) {
                  correctedX = maxX;
                  impactSpeed = Math.max(impactSpeed, Math.abs(velocity.x));
                  velocity.x = -Math.abs(velocity.x);
                  hitVertical = true;
            }
            if (position.y < minY) {
                  correctedY = minY;
                  impactSpeed = Math.max(impactSpeed, Math.abs(velocity.y));
                  velocity.y = Math.abs(velocity.y);
                  hitHorizontal = true;
            } else if (position.y > maxY) {
                  correctedY = maxY;
                  impactSpeed = Math.max(impactSpeed, Math.abs(velocity.y));
                  velocity.y = -Math.abs(velocity.y);
                  hitHorizontal = true;
            }
            if (!hitVertical && !hitHorizontal) return;

            const wall = hitVertical
                  ? position.x < minX ? "left" : "right"
                  : position.y < minY ? "top" : "bottom";
            const wasDashing = this.abilities.isDashing(fighter);
            Body.setPosition(fighter.body, { x: correctedX, y: correctedY });
            const wallResponse = this.abilities.handleWallCollision(fighter, wall, {
                  minX,
                  maxX,
                  minY,
                  maxY,
            }, wasDashing);
            if (!wallResponse.defaultBounce) return;
            this.enforceMinimumDepartureAngle(velocity, hitVertical, hitHorizontal);
            Body.setVelocity(fighter.body, velocity);
            fighter.noteImpact(now);
            fighter.playSound("body-bounce");
            if (!this.host.isGameOver() && wallResponse.allowImpactDamage) {
                  this.applyImpactDamage(fighter, impactSpeed, now);
            }
      }

      private fighterFromBody(body: Body): Fighter | null {
            return this.host.characters.find((fighter) => fighter.body === body) ?? null;
      }

      private projectileFromBody(body: Body): Projectile | null {
            return this.host.projectiles.find((projectile) => projectile.body === body) ?? null;
      }

      private normalImpactSpeed(bodyA: Body, bodyB: Body, normal: Point): number {
            return Math.abs(
                  (bodyA.velocity.x - bodyB.velocity.x) * normal.x +
                  (bodyA.velocity.y - bodyB.velocity.y) * normal.y,
            );
      }

      private enforceMinimumDepartureAngle(
            velocity: Point,
            hitVertical: boolean,
            hitHorizontal: boolean,
      ): void {
            if (hitVertical === hitHorizontal) return;
            const speed = Math.hypot(velocity.x, velocity.y);
            if (speed <= 0) return;
            const minimumNormalSpeed = speed * Math.sin(25 * Math.PI / 180);
            if (hitVertical && Math.abs(velocity.x) < minimumNormalSpeed) {
                  velocity.x = (Math.sign(velocity.x) || 1) * minimumNormalSpeed;
                  velocity.y = (Math.sign(velocity.y) || 1) *
                        Math.sqrt(speed ** 2 - minimumNormalSpeed ** 2);
            } else if (hitHorizontal && Math.abs(velocity.y) < minimumNormalSpeed) {
                  velocity.y = (Math.sign(velocity.y) || 1) * minimumNormalSpeed;
                  velocity.x = (Math.sign(velocity.x) || 1) *
                        Math.sqrt(speed ** 2 - minimumNormalSpeed ** 2);
            }
      }

      private applyImpactDamage(fighter: Fighter, speed: number, now: number): boolean {
            if (fighter.isDead) return false;
            const config = this.gameConfig.physics.impactDamage as ImpactDamageSettings;
            const minSpeed = config.minSpeed ??
                  fighter.baseSpeed * (config.minSpeedMultiplier ?? 2.8);
            if (speed <= minSpeed) return false;
            const baseDamage = config.damage ?? 45;
            const damage = Math.max(
                  1,
                  Math.min(baseDamage * 4, Math.round(baseDamage * (speed - minSpeed) / minSpeed)),
            );
            return applyDamage({
                  target: fighter,
                  amount: damage,
                  nowMs: now,
                  cooldownMs: this.gameConfig.physics.collisionCooldownMs,
                  indicators: this.indicators,
            }).applied;
      }

      private handleFighterImpact(
            first: Fighter,
            second: Fighter,
            now: number,
            speed: number,
            firstWasDashing: boolean,
            secondWasDashing: boolean,
      ): void {
            // Avoid slap-into-self-bounce damage from the fighter that launched them.
            if (!firstWasDashing && !second.isKnockbackFrom(first.id, now))
                  this.applyImpactDamage(first, speed, now);
            if (!secondWasDashing && !first.isKnockbackFrom(second.id, now))
                  this.applyImpactDamage(second, speed, now);
      }
}
