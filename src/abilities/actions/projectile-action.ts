import * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import { Projectile } from "../../entities/projectile";
import type { AbilityConfig, SpawnProjectileAction } from "../types";
import type { ActionExecutionContext } from "./types";

/** Instantiates, launches, and registers a projectile into the physics world. */
export function executeProjectileAction(
      action: SpawnProjectileAction,
      source: Fighter,
      target: Fighter,
      ability: AbilityConfig,
      context: ActionExecutionContext,
): Projectile {
      const config = action.projectile;
      const dx = target.body.position.x - source.body.position.x;
      const dy = target.body.position.y - source.body.position.y;
      const length = Math.hypot(dx, dy) || 1;

      const aim = source.aimSkill?.current;
      const spawnX = aim?.origin.x ?? (
            source.body.position.x +
            (dx / length) * (source.hitbox.halfWidth + config.radius + 2));
      const spawnY = aim?.origin.y ?? (
            source.body.position.y +
            (dy / length) * (source.hitbox.halfHeight + config.radius + 2));

      const projectile = new Projectile(
            config,
            source,
            spawnX,
            spawnY,
            (aim?.direction.x ?? dx / length) * config.speed,
            (aim?.direction.y ?? dy / length) * config.speed,
            ability.audio?.hit ?? null,
      );

      context.projectiles.push(projectile);
      Matter.World.add(context.world, projectile.body);
      return projectile;
}
