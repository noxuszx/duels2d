import type { Entity } from "../../engine/entity";
import { during } from "../../engine/scripting/during";
import type { ScriptOperation } from "../../engine/scripting/operation";
import type { PresentationLease } from "../../presentation/state";
import type { Vector2 } from "../../engine/contracts";

export interface ShakeSettings {
      amplitudePx?: number;
      rotationRadians?: number;
      frequencyHz?: number;
}

/** Content math over generic time and visual leases. Physics is never displaced. */
export function shake(entity: Entity, durationMs: number, {
      amplitudePx = 1.25, rotationRadians = .0125, frequencyHz = 28,
}: ShakeSettings = {}): ScriptOperation {
      let offset: PresentationLease<Vector2>;
      let rotation: PresentationLease<number>;
      let started = false;
      const timer = during(durationMs, (_deltaMs, elapsedMs) => {
            const phase = elapsedMs / 1000 * Math.PI * 2 * frequencyHz;
            offset.set({ x: Math.sin(phase) * amplitudePx, y: Math.sin(phase * 1.37) * amplitudePx });
            rotation.set(Math.sin(phase * .83) * rotationRadians);
      });
      return {
            start(scope) {
                  if (started || scope.isClosed || !entity.isAlive) return false;
                  started = true;
                  offset = scope.use(entity.presentation.acquireOffset());
                  rotation = scope.use(entity.presentation.acquireRotation());
                  return timer.start(scope);
            },
            advance: deltaMs => timer.advance(deltaMs),
            get isComplete() { return timer.isComplete; },
            get nextBoundaryMs() { return timer.nextBoundaryMs; },
            cancel: reason => { started = true; timer.cancel(reason); },
      };
}
