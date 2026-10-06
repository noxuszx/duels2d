import type { TaskGenerator } from "../../../engine/behavior-runtime";
import { wait } from "../../../engine/scripting";
import type { ProjectileEmission, ProjectileEmitter } from "../../../gameplay/components";

/** Content sequencing: sample fresh world-space geometry immediately before each emission group. */
export function* burst(
      emitter: ProjectileEmitter,
      count: number,
      intervalMs: number,
      geometry: (index: number) => ProjectileEmission | null,
): TaskGenerator {
      if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError("Burst count must be a positive safe integer");
      if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new RangeError("Burst interval must be finite and nonnegative");
      for (let index = 0; index < count; index++) {
            if (index > 0) yield wait(intervalMs);
            const trajectories = geometry(index);
            if (!trajectories) return;
            yield emitter.emit(trajectories);
      }
}
