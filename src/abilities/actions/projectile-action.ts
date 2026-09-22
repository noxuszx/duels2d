import * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import { Projectile } from "../../entities/projectile";
import type { SpawnProjectileAction } from "../types";
import type { ActionExecutionContext } from "./types";

/** Instantiates, launches, and registers a projectile into the physics world. */
export function executeProjectileAction(
      action: SpawnProjectileAction,
      source: Fighter,
      target: Fighter,
      context: ActionExecutionContext,
): Projectile {
      const config = action.projectile;
      const dx = target.body.position.x - source.body.position.x;
      const dy = target.body.position.y - source.body.position.y;
      const length = Math.hypot(dx, dy) || 1;

      const spawnX =
            source.body.position.x +
            (dx / length) * (source.hitbox.halfWidth + config.radius + 2);
      const spawnY =
            source.body.position.y +
            (dy / length) * (source.hitbox.halfHeight + config.radius + 2);

      const projectile = new Projectile(
            config,
            source,
            spawnX,
            spawnY,
            (dx / length) * config.speed,
            (dy / length) * config.speed,
      );

      context.projectiles.push(projectile);
      Matter.World.add(context.world, projectile.body);
      source.playSound("weaponFire");
      return projectile;
}
