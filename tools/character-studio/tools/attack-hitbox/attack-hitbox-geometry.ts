import type { MeleeSettings } from "../../../../src/config/component-settings";
import type { Facing, Vector2 } from "../../../../src/types/fighter";
import type { Rect } from "../../app/editor-types";

export function attackHitboxRect(
      center: Vector2,
      action: NonNullable<MeleeSettings["hitbox"]>,
      facing: Facing,
): Rect {
      return {
            x:
                  center.x +
                  action.offset.x * (facing === "left" ? -1 : 1) -
                  action.width / 2,
            y: center.y + action.offset.y - action.height / 2,
            width: action.width,
            height: action.height,
      };
}

export function movedAttackOffset(
      start: Vector2,
      delta: Vector2,
      facing: Facing,
): Vector2 {
      return {
            x: Math.round(start.x + delta.x * (facing === "left" ? -1 : 1)),
            y: Math.round(start.y + delta.y),
      };
}
