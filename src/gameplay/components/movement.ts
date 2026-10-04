import { Body } from "matter-js";
import type { ContactEvent } from "../../engine/contracts";
import type { EntityComponent } from "../../engine/component";
import type { ComponentContext } from "../fighter-factory";
import { SIMULATION_STEP_MS } from "../../engine/simulation";

/** Default cruise/upright behavior yields control to a leased locomotion component. */
export class FloatingMovement implements EntityComponent {
      private uprightAfter = 0;
      constructor(private readonly context: ComponentContext, readonly baseSpeed: number) {}

      beforeStep(): void {
            const { entity, simulation } = this.context;
            const { body } = entity;
            if (!entity.statuses.capabilities.canMove) return;
            if (!entity.resources.isHeld("locomotion")) {
                  const speed = Math.hypot(body.velocity.x, body.velocity.y);
                  if (speed < this.baseSpeed * 0.98) {
                        const angle = speed > 0.01 ? Math.atan2(body.velocity.y, body.velocity.x)
                              : entity.facing === "left" ? Math.PI : 0;
                        const magnitude = body.mass * (this.baseSpeed - speed) * 0.25 /
                              (SIMULATION_STEP_MS * SIMULATION_STEP_MS);
                        Body.applyForce(body, body.position, { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude });
                  }
            }
            if (!entity.resources.isHeld("upright") && simulation.nowMs >= this.uprightAfter) {
                  const error = Math.atan2(Math.sin(-body.angle), Math.cos(-body.angle));
                  const spring = error * body.inertia * 0.000036 * 4;
                  const damping = body.angularVelocity * body.inertia * 0.00043 * 4;
                  const limit = body.inertia * 0.00008 * 4;
                  body.torque += Math.max(-limit, Math.min(limit, spring - damping));
            }
      }

      contact(_event: ContactEvent): void {
            this.uprightAfter = this.context.simulation.nowMs + 500 + this.context.simulation.rng.next() * 1500;
      }
}
