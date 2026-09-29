import type { Fighter } from "../../entities/fighter";
import type { RecoilAction } from "../types";

/** Applies source-side force opposite the direction of the fired attack. */
export function executeRecoilAction(
      action: RecoilAction,
      source: Fighter,
      firingDirection: { x: number; y: number },
      nowMs?: number,
): void {
      source.applyRecoil(
            { x: -firingDirection.x, y: -firingDirection.y },
            action.forceMagnitude,
            nowMs,
      );
}
