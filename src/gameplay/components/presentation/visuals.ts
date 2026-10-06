import type { EntityComponent } from "../../../engine/component";
import type { ScriptOperation } from "../../../engine/scripting";
import { wait } from "../../../engine/scripting";
import type { PoseConfig } from "../../../types/fighter";
import type { ComponentContext } from "../../../engine/component";
import type { SpatialShape } from "../../../engine/spatial/shapes";
import { actionSound } from "./action-sound";

/** Scoped visual timing; interruption restores the previous pose automatically. */
export class Visuals implements EntityComponent {
      constructor(private readonly context: ComponentContext) {}
      attach(): void {}
      pose(pose: PoseConfig, durationMs: number, soundCue?: string): ScriptOperation {
            return this.timed(durationMs, () => typeof pose === "string"
                  ? this.context.entity.presentation.acquirePose(pose)
                  : this.context.entity.presentation.acquireVisual(pose), soundCue);
      }
      shape(shape: SpatialShape | (() => SpatialShape), color: string, durationMs: number,
            opacity = 1): ScriptOperation {
            return this.timed(durationMs, () => this.context.entity.presentation.acquireShape(shape, color, opacity));
      }
      private timed(durationMs: number, acquire: () => () => void, soundCue?: string): ScriptOperation {
            const timer = wait(durationMs);
            return {
                  start: scope => {
                        if (!this.context.entity.isAlive || !timer.start(scope)) return false;
                        scope.add(acquire());
                        actionSound(this.context.entity, scope, soundCue);
                        return true;
                  },
                  advance: deltaMs => timer.advance(deltaMs),
                  get isComplete() { return timer.isComplete; },
                  get nextBoundaryMs() { return timer.nextBoundaryMs; },
                  get endReason() { return timer.endReason; },
                  cancel: reason => timer.cancel(reason),
            };
      }
}
