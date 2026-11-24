import type { TaskGenerator } from "../../../engine/behavior-runtime";
import type { Visuals } from "../../../gameplay/components";
import type { PoseConfig } from "../../../types/entity";

/** Play named visual steps; the caller decides when to commit any gameplay change. `soundCue` starts with the first step. */
export function* poseSequence(
      visuals: Visuals,
      poses: Readonly<Record<string, PoseConfig>>,
      steps: readonly { pose: string; durationMs: number }[],
      soundCue?: string,
): TaskGenerator {
      for (const [index, step] of steps.entries())
      yield visuals.pose(poses[step.pose], step.durationMs, index === 0 ? soundCue : undefined);
}
