import { Body } from "matter-js";
import type { Vector2 } from "../types/fighter";

const FORCE_SCALE = ((1000 / 60) / (1000 / 120)) ** 2;

/** Generic body operations; mechanics own acceleration and target-speed policy. */
export class FighterMovement {
      private cruiseHolds = new Set<symbol>();

      constructor(private readonly body: Body) {}

      get isCruiseSuppressed(): boolean {
            return this.cruiseHolds.size > 0;
      }

      stop(): void {
            Body.setVelocity(this.body, { x: 0, y: 0 });
      }

      suspendCruise(): () => void {
            const owner = Symbol();
            this.cruiseHolds.add(owner);
            return () => this.cruiseHolds.delete(owner);
      }

      applyForce(force: Vector2): void {
            Body.applyForce(this.body, this.body.position, {
                  x: force.x * FORCE_SCALE,
                  y: force.y * FORCE_SCALE,
            });
      }

      reset(): void {
            this.cruiseHolds.clear();
      }
}
