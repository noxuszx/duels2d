import type { EntityComponent } from "../../engine/component";
import type { ScriptOperation } from "../../engine/scripting/operation";
import { wait } from "../../engine/scripting/wait";
import type { PoseConfig } from "../../types/fighter";
import type { ComponentContext } from "../../engine/component";
import type { SpatialShape } from "../../engine/spatial/shapes";

/** Scoped visual timing; interruption restores the previous pose automatically. */
export class Visuals implements EntityComponent {
      constructor(private readonly context: ComponentContext) {}
      attach(): void {}
      pose(pose: PoseConfig, durationMs: number): ScriptOperation {
            return this.timed(durationMs, () => typeof pose === "string"
                  ? this.context.entity.presentation.acquirePose(pose)
                  : this.context.entity.presentation.acquireVisual(pose));
      }
      shape(shape: SpatialShape | (() => SpatialShape), color: string, durationMs: number,
            opacity = 1): ScriptOperation {
            return this.timed(durationMs, () => this.context.entity.presentation.acquireShape(shape, color, opacity));
      }
      private timed(durationMs: number, acquire: () => () => void): ScriptOperation {
            const timer = wait(durationMs);
            return {
                  start: scope => {
                        if (!this.context.entity.isAlive || !timer.start(scope)) return false;
                        scope.add(acquire());
                        return true;
                  },
                  advance: deltaMs => timer.advance(deltaMs),
                  get isComplete() { return timer.isComplete; },
                  get endReason() { return timer.endReason; },
                  cancel: reason => timer.cancel(reason),
            };
      }
}
