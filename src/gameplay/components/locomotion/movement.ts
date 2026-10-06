import { Body } from "matter-js";
import type { EntityComponent } from "../../../engine/component";
import type { ComponentContext } from "../../../engine/component";
import { SIMULATION_STEP_MS } from "../../../engine/simulation";

/** Default cruise/upright behavior yields control to a leased locomotion component. */
export class FloatingMovement implements EntityComponent {
      private uprightAngle = 0;
      constructor(private readonly context: ComponentContext, readonly baseSpeed: number) {}

      beforeStep(deltaMs: number): void {
            const { entity } = this.context;
            const { body } = entity;
            if (entity.statuses.capabilities.canMove && !entity.resources.isHeld("locomotion")) {
                  const speed = Math.hypot(body.velocity.x, body.velocity.y);
                  if (speed < this.baseSpeed * 0.98) {
                        const angle = speed > 0.01 ? Math.atan2(body.velocity.y, body.velocity.x)
                              : entity.facing === "left" ? Math.PI : 0;
                        const magnitude = body.mass * (this.baseSpeed - speed) * 0.25 /
                              (SIMULATION_STEP_MS * SIMULATION_STEP_MS);
                        Body.applyForce(body, body.position, { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude });
                  }
            }
            if (!entity.resources.isHeld("upright")) {
                  const angle = Math.atan2(Math.sin(body.angle), Math.cos(body.angle));
                  this.uprightAngle = angle * Math.exp(-deltaMs / 150);
                  Body.setAngle(body, this.uprightAngle);
                  Body.setAngularVelocity(body, 0);
                  body.torque = 0;
            }
      }

      afterStep(): void {
            const { entity } = this.context;
            if (!entity.resources.isHeld("upright")) {
                  // Collision impulses may translate the fighter, but cannot add idle spin.
                  Body.setAngle(entity.body, this.uprightAngle);
                  Body.setAngularVelocity(entity.body, 0);
                  entity.body.torque = 0;
            }
      }
}
