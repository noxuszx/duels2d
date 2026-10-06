import { Body } from "matter-js";
import type { Entity } from "../../../engine/entity";
import type { EntityComponent, ComponentContext } from "../../../engine/component";
import type { CancellationReason, ContactEvent, Vector2 } from "../../../engine/contracts";
import { during, type ScriptOperation, type ScriptScope } from "../../../engine/scripting";
import type { DashSettings } from "../../../config/component-settings";
import { FloatingMovement } from "./movement";
import { SIMULATION_STEP_MS } from "../../../engine/simulation";

export interface DashTargetOptions {
      /** Target position or entity to dash toward. */
      toward?: { body: { position: Vector2 } } | Vector2;
      /** Explicit normalized direction vector. Overrides toward if provided. */
      direction?: Vector2;
}

/** Equipped once; each start creates an independent, inert dash locomotion operation. */
export class Dasher implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: DashSettings) {}
      attach(): void {}

      start(target?: Entity | DashTargetOptions): ScriptOperation {
            const options: DashTargetOptions | undefined = target
                  ? ("body" in target && "runtimeId" in target ? { toward: target } : target as DashTargetOptions)
                  : undefined;
            return new DashOperation(this.context, this.settings, options);
      }
}

class DashOperation implements ScriptOperation {
      private timer: ScriptOperation | null = null;
      private started = false;
      private stopped = false;
      private conflict = false;
      private direction: Vector2 = { x: 1, y: 0 };
      private readonly hitTargets = new Set<string>();

      constructor(
            private readonly context: ComponentContext,
            private readonly settings: DashSettings,
            private readonly options?: DashTargetOptions,
      ) {}

      get isComplete(): boolean {
            return this.stopped || (this.timer?.isComplete ?? false);
      }

      get nextBoundaryMs(): number {
            return this.stopped ? 0 : (this.timer?.nextBoundaryMs ?? this.settings.maxDurationMs);
      }

      get rejectionReason(): "rejected" | "resource-conflict" {
            return this.conflict ? "resource-conflict" : "rejected";
      }

      start(scope: ScriptScope): boolean {
            if (this.started || scope.isClosed) return false;
            this.started = true;

            const { entity } = this.context;
            if (!entity.isAlive) return false;

            const releaseLocomotion = entity.resources.acquireExclusive("locomotion");
            if (!releaseLocomotion) {
                  this.conflict = true;
                  return false;
            }
            scope.use(releaseLocomotion);

            scope.use(entity.resources.acquireContactPolicy({ allowImpactDamage: false }));

            if (this.settings.pose) {
                  scope.use(entity.presentation.acquirePose(this.settings.pose));
            }

            this.direction = this.resolveDirection();
            if (this.direction.x) {
                  entity.facing = this.direction.x < 0 ? "left" : "right";
            }

            const baseSpeed = entity.components.get<FloatingMovement>("movement")?.baseSpeed ?? entity.config.speed;
            const targetSpeed = baseSpeed * this.settings.speedMultiplier;

            this.timer = during(this.settings.maxDurationMs, deltaMs => {
                  if (this.stopped) return;
                  this.applyDashAcceleration(deltaMs, targetSpeed);
            });

            return this.timer.start(scope);
      }

      advance(deltaMs: number): number {
            if (this.stopped) return 0;
            const consumed = this.timer ? this.timer.advance(deltaMs) : 0;
            if (this.timer?.isComplete) {
                  this.stopped = true;
            }
            return consumed;
      }

      contact(event: ContactEvent): void {
            if (!this.started || this.stopped) return;

            if (event.kind === "entity") {
                  const other = event.other;
                  if (other.isAlive && other.teamId !== this.context.entity.teamId && !this.hitTargets.has(other.runtimeId)) {
                        this.hitTargets.add(other.runtimeId);
                        this.context.simulation.hit(this.context.entity, other, this.settings.hit);
                  }
            }

            const endReason = event.kind === "wall" ? "wall-collision" : "fighter-collision";
            if (this.settings.endOn.includes(endReason)) {
                  this.stopped = true;
                  this.timer?.cancel("interrupted");
            }
      }

      cancel(reason: CancellationReason): void {
            this.started = true;
            this.stopped = true;
            this.hitTargets.clear();
            this.timer?.cancel(reason);
      }

      private resolveDirection(): Vector2 {
            if (this.options?.direction) {
                  const len = Math.hypot(this.options.direction.x, this.options.direction.y);
                  return len > 0
                        ? { x: this.options.direction.x / len, y: this.options.direction.y / len }
                        : { x: this.context.entity.facing === "left" ? -1 : 1, y: 0 };
            }

            const toward = this.options?.toward;
            if (toward) {
                  const targetPos = "body" in toward ? toward.body.position : toward;
                  const dx = targetPos.x - this.context.entity.body.position.x;
                  const dy = targetPos.y - this.context.entity.body.position.y;
                  const dist = Math.hypot(dx, dy);
                  if (dist > 0) return { x: dx / dist, y: dy / dist };
            }

            return { x: this.context.entity.facing === "left" ? -1 : 1, y: 0 };
      }

      private applyDashAcceleration(deltaMs: number, targetSpeed: number): void {
            const { entity } = this.context;
            const forward = entity.body.velocity.x * this.direction.x + entity.body.velocity.y * this.direction.y;
            if (forward < targetSpeed) {
                  const forceRatio = Math.max(0, 1 - forward / targetSpeed);
                  const forceMagnitude = this.settings.accelerationForce * forceRatio * 4 * (deltaMs / SIMULATION_STEP_MS);
                  Body.applyForce(entity.body, entity.body.position, {
                        x: this.direction.x * forceMagnitude,
                        y: this.direction.y * forceMagnitude,
                  });
            }
      }
}
