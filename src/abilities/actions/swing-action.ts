import type { SwingAction } from "../types";

/** Computes the weapon rotation angle in radians across the active simulation-time window. */
export function calculateSwingAngle(
      action: SwingAction,
      state: "windup" | "active" | "recovery" | "idle",
      remainingMs: number,
      totalActiveMs: number,
): number {
      let degrees = action.startDegrees;
      if (state === "active") {
            const durationMs = Math.max(1, totalActiveMs);
            const progress = Math.max(0, Math.min(1, 1 - remainingMs / durationMs));
            degrees += (action.endDegrees - action.startDegrees) * progress;
      } else if (state === "recovery") {
            degrees = action.endDegrees;
      }
      return (degrees * Math.PI) / 180;
}
