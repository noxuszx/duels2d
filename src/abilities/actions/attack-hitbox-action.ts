import { Bodies, Query, type Body } from "matter-js";
import type { Fighter } from "../../entities/fighter";
import type { AttackHitboxAction } from "../types";

export interface AttackHitboxGeometry {
      center: { x: number; y: number };
      width: number;
      height: number;
      angle: number;
}

/** Resolves a facing-relative attack rectangle into world coordinates. */
export function getAttackHitboxGeometry(
      source: Fighter,
      action: AttackHitboxAction,
): AttackHitboxGeometry {
      const visualOrigin = source.visualPosition;
      const localX = source.facing === "right" ? action.offset.x : -action.offset.x;
      const cos = Math.cos(source.body.angle);
      const sin = Math.sin(source.body.angle);
      return {
            center: {
                  x: visualOrigin.x + localX * cos - action.offset.y * sin,
                  y: visualOrigin.y + localX * sin + action.offset.y * cos,
            },
            width: action.width,
            height: action.height,
            angle: source.body.angle,
      };
}

export function createAttackHitboxBody(
      source: Fighter,
      action: AttackHitboxAction,
): Body {
      const geometry = getAttackHitboxGeometry(source, action);
      return Bodies.rectangle(
            geometry.center.x,
            geometry.center.y,
            geometry.width,
            geometry.height,
            { angle: geometry.angle, isSensor: true, isStatic: true },
      );
}

/** Uses Matter's shape collision query without adding the temporary sensor to the world. */
export function attackHitboxOverlaps(
      source: Fighter,
      target: Fighter,
      action: AttackHitboxAction,
): boolean {
      return Query.collides(createAttackHitboxBody(source, action), [target.body])
            .length > 0;
}
