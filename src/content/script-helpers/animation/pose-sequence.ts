import type { TaskGenerator } from "../../../engine/behavior-runtime";
import type { Visuals } from "../../../gameplay/components";
import type { PoseConfig } from "../../../types/entity";

/** Play named visual steps; the caller decides when to commit any gameplay change. */
export function* poseSequence(
      visuals: Visuals,
      poses: Readonly<Record<string, PoseConfig>>,
      steps: readonly { pose: string; durationMs: number }[],
): TaskGenerator {
      for (const step of steps) yield visuals.pose(poses[step.pose], step.durationMs);
}
