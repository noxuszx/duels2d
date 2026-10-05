import { Body } from "matter-js";
import type { Entity } from "../../engine/entity";
import type { EntityComponent } from "../../engine/component";
import type { CancellationReason, ContactEvent } from "../../engine/contracts";
import type { ScriptOperation } from "../../engine/scripting/operation";
import type { ScriptScope } from "../../engine/scripting/scope";
import type { DashSettings } from "../../config/component-settings";
import type { ComponentContext } from "../../engine/component";
import { FloatingMovement } from "./movement";
import { actionSound } from "./action-sound";
import { SIMULATION_STEP_MS } from "../../engine/simulation";

export class Dasher implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: DashSettings) { }
      attach(): void { }
      start(target: Entity): ScriptOperation {
            return new DashOperation(this.context, this.settings, target);
      }
}

class DashOperation implements ScriptOperation {
      private active = false;
      private started = false;
      private complete = false;
      private elapsedMs = 0;
      private direction = { x: 1, y: 0 };
      private hitTargets = new Set<string>();
      rejectionReason: "rejected" | "resource-conflict" = "rejected";
      constructor(private readonly context: ComponentContext, private readonly settings: DashSettings, private readonly target: Entity) { }
      get isComplete(): boolean { return this.complete; }
      get nextBoundaryMs(): number { return Math.max(0, this.settings.maxDurationMs - this.elapsedMs); }

      start(scope: ScriptScope): boolean {

            if (this.started) return false;
            this.started = true;
            const { entity, simulation } = this.context;
            if (!entity.isAlive || !this.target.isAlive || entity.teamId === this.target.teamId ||
                  !simulation.entities.all().includes(this.target)) return false;

            const release = entity.resources.acquireExclusive("locomotion");
            if (!release) { this.rejectionReason = "resource-conflict"; return false; }

            scope.add(release);
            scope.add(entity.resources.acquireContactPolicy({ allowImpactDamage: false }));
            if (this.settings.pose) scope.add(entity.presentation.acquirePose(this.settings.pose));

            actionSound(entity, scope, this.settings.sound);
            const x = this.target.body.position.x - entity.body.position.x;
            const y = this.target.body.position.y - entity.body.position.y;
            const distance = Math.hypot(x, y);
            this.direction = distance ? { x: x / distance, y: y / distance } : { x: entity.facing === "left" ? -1 : 1, y: 0 };
            if (this.direction.x) entity.facing = this.direction.x < 0 ? "left" : "right";
            this.active = true;
            return true;
      }

      advance(deltaMs: number): number {

            if (!this.active) return 0;
            const consumed = Math.min(deltaMs, this.settings.maxDurationMs - this.elapsedMs);
            this.elapsedMs += consumed;
            const { entity } = this.context;
            const forward = entity.body.velocity.x * this.direction.x + entity.body.velocity.y * this.direction.y;
            const speed = (entity.components.get<FloatingMovement>("movement")?.baseSpeed ?? entity.config.speed) * this.settings.speedMultiplier;
            if (forward < speed) {
                  const force = this.settings.accelerationForce * Math.max(0, 1 - forward / speed) * 4 *
                        consumed / SIMULATION_STEP_MS;
                  Body.applyForce(entity.body, entity.body.position, { x: this.direction.x * force, y: this.direction.y * force });
            }
            if (this.settings.maxDurationMs - this.elapsedMs <= 1e-9) { this.active = false; this.complete = true; }
            return consumed;
      }
      contact(event: ContactEvent): void {
            if (!this.active) return;
            if (event.kind === "entity") {
                  const other = event.other;
                  if (!other.isAlive || other.teamId === this.context.entity.teamId || this.hitTargets.has(other.runtimeId)) return;
                  this.hitTargets.add(other.runtimeId);
                  const result = this.context.simulation.hit(this.context.entity, other, this.settings.hit);
                  if (result.connected && this.settings.hitSound)
                        this.context.entity.presentation.emit("sound", { cue: this.settings.hitSound });
            }
            const end = event.kind === "wall" ? "wall-collision" : "fighter-collision";
            if (this.settings.endOn.includes(end)) { this.active = false; this.complete = true; }
      }
      cancel(_reason: CancellationReason): void { this.active = false; this.hitTargets.clear(); }
}
