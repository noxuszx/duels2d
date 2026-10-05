import { Body } from "matter-js";
import type { Entity } from "../../engine/entity";

/** Stop once and pause voluntary cruise; the script scope owns the returned release. */
export function pauseMovement(entity: Entity): (() => void) | null {
      const release = entity.resources.acquireExclusive("locomotion");
      if (!release) return null;
      try {
            Body.setVelocity(entity.body, { x: 0, y: 0 });
            return release;
      } catch (error) {
            release();
            throw error;
      }
}
