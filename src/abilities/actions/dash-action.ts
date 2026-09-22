import type * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import type { DashAction } from "../types";

/** Applies charge force to accelerate the source fighter in the target direction. */
export function executeDashAction(
      action: DashAction,
      source: Fighter,
      direction: Matter.Vector,
): void {
      source.applyChargeForce(
            direction,
            action.accelerationForce,
            action.speedMultiplier,
      );
}
