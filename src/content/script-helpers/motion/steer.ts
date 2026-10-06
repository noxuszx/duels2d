import { Body } from "matter-js";
import type { Entity } from "../../../engine/entity";
import type { Vector2 } from "../../../engine/contracts";
import { during, type ScriptOperation } from "../../../engine/scripting";

/** Command velocity while Matter owns motion and collisions. Values use Matter's velocity units. */
export function steer(entity: Entity, durationMs: number,
      velocity: (elapsedMs: number) => Vector2): ScriptOperation {
      let started = false;
      let cancelled = false;
      let conflict = false;
      const timer = during(durationMs, (_deltaMs, elapsedMs) => {
            const value = velocity(elapsedMs);
            if (cancelled) return;
            if (!Number.isFinite(value.x) || !Number.isFinite(value.y))
                  throw new RangeError("Steering velocity must be finite");
            Body.setVelocity(entity.body, value);
      });
      return {
            start(scope) {
                  if (started || scope.isClosed || !entity.isAlive || entity.body.isStatic) return false;
                  started = true;
                  const release = entity.resources.acquireExclusive("locomotion");
                  if (!release) { conflict = true; return false; }
                  scope.use(release);
                  scope.add(() => Body.setVelocity(entity.body, { x: 0, y: 0 }));
                  return timer.start(scope);
            },
            advance: deltaMs => timer.advance(deltaMs),
            get isComplete() { return timer.isComplete; },
            get nextBoundaryMs() { return timer.nextBoundaryMs; },
            get rejectionReason() { return conflict ? "resource-conflict" as const : "rejected" as const; },
            cancel: reason => { started = true; cancelled = true; timer.cancel(reason); },
      };
}
