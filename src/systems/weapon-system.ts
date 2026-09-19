import * as Matter from "matter-js";
import { Fighter } from "../entities/fighter";
import { Projectile, type ProjectileConfig } from "../entities/projectile";
import type { ProjectileWeapon, ProximityMeleeWeapon } from "../types/weapon";
import type { IndicatorSystem } from "./indicator-system";

type Rectangle = { x: number; y: number; width: number; height: number };

interface WeaponSystemGameManager {
      characters: Fighter[];
      projectiles: Projectile[];
      world: Matter.World;
      COLLISION_COOLDOWN: number;
      indicators: IndicatorSystem;
}

export class WeaponSystem {
      private readonly gm: WeaponSystemGameManager;
      private readonly dashTargets = new Map<Fighter, Fighter>();
      private readonly dashHits = new Set<Fighter>();

      constructor(gameManager: WeaponSystemGameManager) {
            this.gm = gameManager;
      }

      private get characters(): Fighter[] {
            return this.gm.characters;
      }
      private get projectiles(): Projectile[] {
            return this.gm.projectiles;
      }
      private get world(): Matter.World {
            return this.gm.world;
      }
      private get collisionCooldown(): number {
            return this.gm.COLLISION_COOLDOWN;
      }
      private get indicators(): IndicatorSystem {
            return this.gm.indicators;
      }

      update(): void {
            const now = performance.now();
            this.characters.forEach((character) => {
                  const previousWeaponState = character.weaponState;
                  character.updateWeaponState();

                  if (
                        character.weapon?.type === "proximity-melee" &&
                        character.weapon.dash &&
                        previousWeaponState === "windup" &&
                        character.weaponState === "active"
                  ) {
                        const target = this.dashTargets.get(character);
                        if (target && !target.isDead) {
                              character.applyVelocityBoost(
                                    {
                                          x:
                                                target.body.position.x -
                                                character.body.position.x,
                                          y:
                                                target.body.position.y -
                                                character.body.position.y,
                                    },
                                    character.weapon.dash.speedMultiplier,
                                    character.weapon.dash.durationMs,
                              );
                        }
                  }

                  if (
                        character.weapon?.type === "proximity-melee" &&
                        character.weapon.dash &&
                        character.weaponState === "active"
                  ) {
                        const target = this.dashTargets.get(character);
                        if (
                              target &&
                              !target.isDead &&
                              !this.dashHits.has(character) &&
                              this.rectanglesOverlap(
                                    this.getMeleeAttackBox(character),
                                    this.getCharacterBox(target),
                              )
                        ) {
                              this.applyMeleeHit(character, target);
                              this.dashHits.add(character);
                        }
                  }

                  if (character.weaponState === "idle") {
                        this.dashTargets.delete(character);
                        this.dashHits.delete(character);
                  }
                  if (
                        character.isDead ||
                        !character.weapon ||
                        !character.canUseWeapon(now)
                  )
                        return;
                  if (character.weapon.type === "projectile") {
                        const target = this.findNearestEnemy(character);
                        if (target)
                              this.fireProjectileWeapon(
                                    character,
                                    target,
                                    character.weapon,
                                    now,
                              );
                  } else if (character.weapon.type === "proximity-melee") {
                        const target = character.weapon.dash
                              ? this.findNearestEnemy(character)
                              : this.findTargetInMeleeRange(character);
                        if (target)
                              this.triggerMeleeWeapon(
                                    character,
                                    target,
                                    character.weapon,
                                    now,
                              );
                  }
            });
      }

      updateFaceTargeting(): void {
            this.characters.forEach((character) => {
                  if (character.isDead) return;
                  const mode = character.faceTarget?.mode ?? "never";
                  if (mode === "always")
                        character.setFacingToward(
                              this.findNearestEnemy(character),
                        );
                  else if (mode === "range") {
                        const target = this.findTargetInMeleeRange(character);
                        if (target) character.setFacingToward(target);
                        else character.facing = character.defaultFacing;
                  } else character.facing = character.defaultFacing;
            });
      }

      private findNearestEnemy(character: Fighter): Fighter | null {
            let nearest: Fighter | null = null;
            let nearestDistance = Infinity;
            this.characters.forEach((enemy) => {
                  if (enemy === character || enemy.isDead) return;
                  const distanceX =
                        enemy.body.position.x - character.body.position.x;
                  const distanceY =
                        enemy.body.position.y - character.body.position.y;
                  const distance =
                        distanceX * distanceX + distanceY * distanceY;
                  if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearest = enemy;
                  }
            });
            return nearest;
      }

      private findTargetInMeleeRange(character: Fighter): Fighter | null {
            const attackBox = this.getMeleeAttackBox(character);
            return (
                  this.characters.find(
                        (enemy) =>
                              enemy !== character &&
                              !enemy.isDead &&
                              this.rectanglesOverlap(
                                    attackBox,
                                    this.getCharacterBox(enemy),
                              ),
                  ) ?? null
            );
      }

      private getCharacterBox(character: Fighter): Rectangle {
            return {
                  x: character.body.position.x - character.hitbox.halfWidth,
                  y: character.body.position.y - character.hitbox.halfHeight,
                  width: character.hitbox.halfWidth * 2,
                  height: character.hitbox.halfHeight * 2,
            };
      }

      private getMeleeAttackBox(character: Fighter): Rectangle {
            const padding =
                  character.weapon?.type === "proximity-melee"
                        ? (character.weapon.rangePadding ?? 0)
                        : 0;
            return {
                  x:
                        character.body.position.x -
                        character.hitbox.halfWidth -
                        padding,
                  y:
                        character.body.position.y -
                        character.hitbox.halfHeight -
                        padding,
                  width: character.hitbox.halfWidth * 2 + padding * 2,
                  height: character.hitbox.halfHeight * 2 + padding * 2,
            };
      }

      private rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
            return (
                  first.x < second.x + second.width &&
                  first.x + first.width > second.x &&
                  first.y < second.y + second.height &&
                  first.y + first.height > second.y
            );
      }

      private triggerMeleeWeapon(
            character: Fighter,
            target: Fighter,
            weapon: ProximityMeleeWeapon,
            nowMs: number,
      ): void {
            const damage = weapon.damage ?? character.baseDamage;
            character.markWeaponUsed(nowMs);
            character.startWeaponAnimation();
            character.playSound("weaponSlap");
            if (weapon.dash) {
                  this.dashTargets.set(character, target);
                  this.dashHits.delete(character);
                  return;
            }
            this.applyMeleeHit(character, target, damage);
      }

      private applyMeleeHit(
            character: Fighter,
            target: Fighter,
            damage = character.weapon?.type === "proximity-melee"
                  ? (character.weapon.damage ?? character.baseDamage)
                  : character.baseDamage,
      ): void {
            if (!target.takeDamage(damage, Date.now(), this.collisionCooldown))
                  return;
            target.playSound("hurt");
            if (character.weapon?.type === "proximity-melee")
                  this.applyWeaponKnockback(character, target, character.weapon);
            this.indicators.spawnDamageIndicator(target, damage);
            this.indicators.spawnHitSpark(target.body.position, target.color);
            this.indicators.spawnCharacterLine(character, "weaponHit");
      }

      private applyWeaponKnockback(
            character: Fighter,
            target: Fighter,
            weapon: ProximityMeleeWeapon,
      ): void {
            if (!weapon.knockback) return;
            const knockback = weapon.knockback;
            target.applyVelocityBoost(
                  {
                        x: target.body.position.x - character.body.position.x,
                        y: target.body.position.y - character.body.position.y,
                  },
                  knockback === true ? undefined : knockback.speedMultiplier,
                  knockback === true ? undefined : knockback.durationMs,
                  character.id,
            );
      }

      private fireProjectileWeapon(
            character: Fighter,
            target: Fighter,
            weapon: ProjectileWeapon,
            nowMs: number,
      ): void {
            const projectileConfig = weapon.projectile;
            const distanceX =
                  target.body.position.x - character.body.position.x;
            const distanceY =
                  target.body.position.y - character.body.position.y;
            const length = Math.hypot(distanceX, distanceY) || 1;
            const velocityX = (distanceX / length) * projectileConfig.speed;
            const velocityY = (distanceY / length) * projectileConfig.speed;
            this.spawnProjectile(
                  projectileConfig,
                  character,
                  character.body.position.x +
                        (distanceX / length) *
                              (character.hitbox.halfWidth +
                                    projectileConfig.radius +
                                    2),
                  character.body.position.y +
                        (distanceY / length) *
                              (character.hitbox.halfHeight +
                                    projectileConfig.radius +
                                    2),
                  velocityX,
                  velocityY,
            );
            character.markWeaponUsed(nowMs);
            character.startWeaponAnimation();
            character.playSound("weapon-fire");
      }

      private spawnProjectile(
            config: ProjectileConfig,
            owner: Fighter,
            x: number,
            y: number,
            velocityX: number,
            velocityY: number,
      ): Projectile {
            const projectile = new Projectile(
                  config,
                  owner,
                  x,
                  y,
                  velocityX,
                  velocityY,
            );
            this.projectiles.push(projectile);
            Matter.World.add(this.world, projectile.body);
            return projectile;
      }
}
