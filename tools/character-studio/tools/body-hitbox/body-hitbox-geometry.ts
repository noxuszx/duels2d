import type { Vector2 } from "../../../../src/types/fighter";
import type { Rect, StudioConfig } from "../../app/editor-types";
import type { HitboxToolHost } from "./body-hitbox-tool";

export function getHitboxRect(
      host: Pick<HitboxToolHost, "canvas">,
      config: Pick<StudioConfig, "hitbox" | "hitboxOffset">,
): Rect {
      const centerX = host.canvas.width / 2;
      const centerY = host.canvas.height / 2;
      const offset = config.hitboxOffset ?? { x: 0, y: 0 };
      const hitCenterX = centerX + offset.x;
      const hitCenterY = centerY + offset.y;
      if (config.hitbox.type === "box") {
            return {
                  x: hitCenterX - config.hitbox.width / 2,
                  y: hitCenterY - config.hitbox.height / 2,
                  width: config.hitbox.width,
                  height: config.hitbox.height,
            };
      }
      const radius = config.hitbox.radius;
      return {
            x: hitCenterX - radius,
            y: hitCenterY - radius,
            width: radius * 2,
            height: radius * 2,
      };
}

export function getSafetyRect(
      host: Pick<HitboxToolHost, "canvas" | "_getPoseVisual" | "activePoseKey">,
      config: StudioConfig,
): Rect {
      const visual = host._getPoseVisual(config, host.activePoseKey);
      const drawRadius = (config.radius ?? 30) * visual.imageScale;
      return {
            x: host.canvas.width / 2 + visual.imageOffset.x - drawRadius,
            y: host.canvas.height / 2 + visual.imageOffset.y - drawRadius,
            width: drawRadius * 2,
            height: drawRadius * 2,
      };
}

export function clampHitboxOffset(
      host: Pick<HitboxToolHost, "canvas" | "_getPoseVisual" | "activePoseKey">,
      config: StudioConfig,
      offset: Vector2,
): Vector2 {
      const safety = getSafetyRect(host, config);
      const centerX = host.canvas.width / 2;
      const centerY = host.canvas.height / 2;
      return {
            x: Math.max(
                  -(centerX - safety.x),
                  Math.min(offset.x, safety.x + safety.width - centerX),
            ),
            y: Math.max(
                  -(centerY - safety.y),
                  Math.min(offset.y, safety.y + safety.height - centerY),
            ),
      };
}

export function hitTestRectHandles(
      px: number,
      py: number,
      rect: Rect,
): string | null {
      const half = 6;
      const hits: Array<[string, number, number]> = [
            ["nw", rect.x, rect.y],
            ["n", rect.x + rect.width / 2, rect.y],
            ["ne", rect.x + rect.width, rect.y],
            ["w", rect.x, rect.y + rect.height / 2],
            ["e", rect.x + rect.width, rect.y + rect.height / 2],
            ["sw", rect.x, rect.y + rect.height],
            ["s", rect.x + rect.width / 2, rect.y + rect.height],
            ["se", rect.x + rect.width, rect.y + rect.height],
      ];
      for (const [name, x, y] of hits)
            if (Math.abs(px - x) <= half && Math.abs(py - y) <= half)
                  return name;
      return px >= rect.x &&
            px <= rect.x + rect.width &&
            py >= rect.y &&
            py <= rect.y + rect.height
            ? "move"
            : null;
}

export function hitTestCircleHandle(
      px: number,
      py: number,
      rect: Rect,
): string | null {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const radius = rect.width / 2;
      const distance = Math.hypot(px - cx, py - cy);
      return Math.abs(distance - radius) <= 10
            ? "radius"
            : distance < radius
              ? "move"
              : null;
}
