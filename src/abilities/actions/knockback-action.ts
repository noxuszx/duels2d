import type { Fighter } from "../../entities/fighter";
import type { KnockbackAction } from "../types";

/** Applies directional force knockback to a target away from the source. */
export function executeKnockbackAction(
      action: KnockbackAction,
      source: Fighter,
      target: Fighter,
      customDirection?: { x: number; y: number },
): void {
      const direction = customDirection ?? {
            x: target.body.position.x - source.body.position.x,
            y: target.body.position.y - source.body.position.y,
      };
      target.applyForceKnockback(direction, action.forceMagnitude, source.id);
}
