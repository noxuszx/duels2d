import type { Fighter } from "../entities/fighter";
import { Projectile, type ProjectileOptions } from "../entities/projectile";
import type { ProjectileConfig } from "../abilities/types";
import type { FighterBehaviorContext } from "../behaviors/types";

/** Shared targeting/spawn geometry. The host owns registration and world cleanup. */
export function launchProjectile(
      source: Fighter,
      target: Fighter,
      config: ProjectileConfig,
      host: Pick<FighterBehaviorContext, "addProjectile">,
      hitSoundCue: string | null = null,
      options: ProjectileOptions = {},
): Projectile {
      const dx = target.body.position.x - source.body.position.x;
      const dy = target.body.position.y - source.body.position.y;
      const length = Math.hypot(dx, dy);
      const fallback = source.facing === "left" ? -1 : 1;
      const direction = source.aimSkill?.current?.direction ??
            (length ? { x: dx / length, y: dy / length } : { x: fallback, y: 0 });
      const origin = source.aimSkill?.current?.origin ?? {
            x: source.body.position.x + direction.x * (source.hitbox.halfWidth + config.radius + 2),
            y: source.body.position.y + direction.y * (source.hitbox.halfHeight + config.radius + 2),
      };
      const projectile = new Projectile(config, source, origin.x, origin.y,
            direction.x * config.speed, direction.y * config.speed, hitSoundCue, options);
      host.addProjectile(projectile);
      return projectile;
}
