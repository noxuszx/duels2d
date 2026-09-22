import type { SwingAction } from "../types";

/** Computes the weapon rotation angle in radians for a swing action across ability frames. */
export function calculateSwingAngle(
      action: SwingAction,
      state: "windup" | "active" | "recovery" | "idle",
      timer: number,
      totalActiveFrames: number,
): number {
      let degrees = action.startDegrees;
      if (state === "active") {
            const frames = Math.max(1, totalActiveFrames);
            const progress = Math.max(0, Math.min(1, 1 - timer / frames));
            degrees += (action.endDegrees - action.startDegrees) * progress;
      } else if (state === "recovery") {
            degrees = action.endDegrees;
      }
      return (degrees * Math.PI) / 180;
}
