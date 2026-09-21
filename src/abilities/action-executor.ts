import * as Matter from "matter-js";
import { Fighter } from "../entities/fighter";
import { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import type { AbilityAction, AbilityConfig, ProjectileConfig } from "./types";

export interface ActionExecutorContext {
      projectiles: Projectile[];
      world: Matter.World;
      COLLISION_COOLDOWN: number;
      indicators: IndicatorSystem;
}

export class ActionExecutor {
      constructor(private readonly context: ActionExecutorContext) {}

      executeTargetActions(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
      ): void {
            const damage = ability.actions.find(
                  (
                        action,
                  ): action is Extract<AbilityAction, { type: "damage" }> =>
                        action.type === "damage",
            );
            const knockback = ability.actions.find(
                  (
                        action,
                  ): action is Extract<AbilityAction, { type: "knockback" }> =>
                        action.type === "knockback",
            );
            const didDamage = damage
                  ? target.takeDamage(
                          damage.amount,
                          Date.now(),
                          this.context.COLLISION_COOLDOWN,
                    )
                  : false;

            if (knockback)
                  target.applyForceKnockback(
                        {
                              x:
                                    target.body.position.x -
                                    source.body.position.x,
                              y:
                                    target.body.position.y -
                                    source.body.position.y,
                        },
                        knockback.forceMagnitude,
                        source.id,
                  );

            if (!didDamage || !damage) return;
            target.playSound("hurt");
            this.context.indicators.spawnDamageIndicator(target, damage.amount);
            this.context.indicators.spawnHitSpark(
                  target.body.position,
                  target.color,
            );
            this.context.indicators.spawnCharacterLine(source, "weaponHit");
      }

      executeProjectileAction(
            source: Fighter,
            target: Fighter,
            action: Extract<AbilityAction, { type: "spawn-projectile" }>,
      ): void {
            const config = action.projectile;
            const dx = target.body.position.x - source.body.position.x;
            const dy = target.body.position.y - source.body.position.y;
            const length = Math.hypot(dx, dy) || 1;
            const projectile = this.spawnProjectile(
                  config,
                  source,
                  source.body.position.x +
                        (dx / length) *
                              (source.hitbox.halfWidth + config.radius + 2),
                  source.body.position.y +
                        (dy / length) *
                              (source.hitbox.halfHeight + config.radius + 2),
                  (dx / length) * config.speed,
                  (dy / length) * config.speed,
            );
            this.context.projectiles.push(projectile);
            Matter.World.add(this.context.world, projectile.body);
            source.playSound("weapon-fire");
      }

      applyDash(
            source: Fighter,
            direction: Matter.Vector,
            action: Extract<AbilityAction, { type: "dash" }>,
      ): void {
            source.applyChargeForce(
                  direction,
                  action.accelerationForce,
                  action.speedMultiplier,
            );
      }

      private spawnProjectile(
            config: ProjectileConfig,
            owner: Fighter,
            x: number,
            y: number,
            velocityX: number,
            velocityY: number,
      ): Projectile {
            return new Projectile(config, owner, x, y, velocityX, velocityY);
      }
}
