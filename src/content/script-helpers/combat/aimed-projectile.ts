import type { Entity } from "../../../engine/entity";
import type { Vector2 } from "../../../engine/contracts";
import type { ProjectileTrajectory } from "../../../gameplay/components/combat/projectile/factory";

/** Aim at a world position and start outside the owner's hitbox. */
export function aimedProjectile(owner: Entity, target: Vector2 | undefined, projectileRadius: number, gap = 1,): ProjectileTrajectory {

      const origin = owner.body.position;
      const dx = target ? target.x - origin.x : 0;
      const dy = target ? target.y - origin.y : 0;
      const distance = Math.hypot(dx, dy);
      
      const direction = distance > 1e-9
            ? { x: dx / distance, y: dy / distance }
            : { x: owner.facing === "left" ? -1 : 1, y: 0 };

      const box = owner.config.hitbox;
      const clearance = (box.type === "box" ? Math.hypot(box.width / 2, box.height / 2) : box.radius)
            + projectileRadius + gap;
            
      return {
            position: { x: origin.x + direction.x * clearance, y: origin.y + direction.y * clearance },
            direction,
      };

}
