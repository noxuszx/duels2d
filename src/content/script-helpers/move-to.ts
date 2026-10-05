import { Body } from "matter-js";
import type { Entity } from "../../engine/entity";
import type { Vector2 } from "../../engine/contracts";
import type { ScriptOperation } from "../../engine/scripting/operation";
import { tween } from "../../engine/scripting/tween";

/** Move a static actor along a straight path. Dynamic fighters use steer so Matter resolves motion. */
export function moveTo(entity: Entity, destination: Vector2, durationMs: number): ScriptOperation {
      if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y))
            throw new RangeError("Movement destination must be finite");
      const target = { ...destination };
      let origin: Vector2;
      let started = false;
      let conflict = false;
      const timer = tween(durationMs, progress => Body.setPosition(entity.body, {
            x: origin.x + (target.x - origin.x) * progress,
            y: origin.y + (target.y - origin.y) * progress,
      }));
      return {
            start(scope) {
                  if (started || scope.isClosed || !entity.isAlive || !entity.body.isStatic) return false;
                  started = true;
                  const release = entity.resources.acquireExclusive("locomotion");
                  if (!release) { conflict = true; return false; }
                  scope.use(release);
                  origin = { ...entity.body.position };
                  return timer.start(scope);
            },
            advance: deltaMs => timer.advance(deltaMs),
            get isComplete() { return timer.isComplete; },
            get nextBoundaryMs() { return timer.nextBoundaryMs; },
            get rejectionReason() { return conflict ? "resource-conflict" as const : "rejected" as const; },
            cancel: reason => { started = true; timer.cancel(reason); },
      };
}
