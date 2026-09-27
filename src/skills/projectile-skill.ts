import * as Matter from "matter-js";
import { Projectile } from "../entities/projectile";
import type { ProjectileSkillOptions } from "./types";

/**
 * Reusable projectile launch skill. It calculates a target-directed spawn point,
 * creates the projectile, and registers it with the physics world.
 */
export class ProjectileSkill {
      launch(options: ProjectileSkillOptions): Projectile {
            const {
                  config,
                  source,
                  target,
                  hitSoundCue,
                  addProjectile,
                  world,
            } = options;
            const dx = target.body.position.x - source.body.position.x;
            const dy = target.body.position.y - source.body.position.y;
            const length = Math.hypot(dx, dy) || 1;
            const x = source.body.position.x + (dx / length) *
                  (source.hitbox.halfWidth + config.radius + 2);
            const y = source.body.position.y + (dy / length) *
                  (source.hitbox.halfHeight + config.radius + 2);
            const projectile = new Projectile(
                  config,
                  source,
                  x,
                  y,
                  (dx / length) * config.speed,
                  (dy / length) * config.speed,
                  hitSoundCue,
            );
            addProjectile(projectile);
            Matter.World.add(world, projectile.body);
            return projectile;
      }
}
