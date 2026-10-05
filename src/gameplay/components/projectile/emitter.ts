import type { ProjectileEmitterSettings, ProjectileSettings } from "../../../config/component-settings";
import type { EntityComponent } from "../../../engine/component";
import type { CancellationReason, Vector2 } from "../../../engine/contracts";
import type { Entity } from "../../../engine/entity";
import type { ScriptOperation } from "../../../engine/scripting/operation";
import type { ScriptScope } from "../../../engine/scripting/scope";
import type { ComponentContext } from "../../../engine/component";

import { createProjectile, type ProjectileTrajectory } from "./factory";

export type ProjectileEmission = ProjectileTrajectory | readonly ProjectileTrajectory[];

function isFiniteVector(v: Vector2): boolean {
      return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function isValidProjectileConfig(shot: ProjectileSettings): boolean {
      if (!Number.isFinite(shot.radius) || shot.radius <= 0) return false;
      if (!Number.isFinite(shot.speed) || shot.speed <= 0) return false;
      if (!Number.isFinite(shot.damage) || shot.damage < 0) return false;
      if (
            shot.flight.lifetime.type === "duration" &&
            (!Number.isFinite(shot.flight.lifetime.durationMs) || shot.flight.lifetime.durationMs <= 0)
      ) {
            return false;
      }
      if (Array.isArray(shot.image) && shot.image.length === 0) return false;
      return true;
}

/** An owner-bound capability. Each spawn owns its own flight state and contact history. */
export class ProjectileEmitter implements EntityComponent {
      constructor(
            private readonly context: ComponentContext,
            private readonly settings: ProjectileEmitterSettings,
      ) { }

      attach(): void { }

      /** Inert until admitted by a behavior; a successful shot commits its move cooldown. */
      emit(trajectories: ProjectileEmission): ScriptOperation {
            return new FireProjectiles(this, trajectories);
      }

      /** Validates the whole world-space group before spawning; feedback occurs once per group. */
      spawn(trajectories: ProjectileEmission): readonly Entity[] | null {
            const { entity: owner, simulation } = this.context;
            if (!owner.isAlive || !simulation.isCombatActive || !simulation.entities.isLive(owner)) return null;
            const shot = this.settings.projectile;
            if (!isValidProjectileConfig(shot)) return null;
            const group: readonly ProjectileTrajectory[] = Array.isArray(trajectories)
                  ? trajectories : [trajectories as ProjectileTrajectory];
            if (!group.length) return null;
            for (const trajectory of group) {
                  if (!trajectory || !trajectory.position || !trajectory.direction ||
                        !isFiniteVector(trajectory.position) || !isFiniteVector(trajectory.direction) ||
                        Math.abs(Math.hypot(trajectory.direction.x, trajectory.direction.y) - 1) > 1e-6) return null;
            }
            const projectiles = group.map(trajectory =>
                  createProjectile(this.context, shot, trajectory, this.settings.hitSound));
            const meanDirection = group.reduce((sum, trajectory) => ({
                  x: sum.x + trajectory.direction.x / group.length,
                  y: sum.y + trajectory.direction.y / group.length,
            }), { x: 0, y: 0 });
            this.emitFiringFeedback(meanDirection);
            return projectiles;
      }

      private emitFiringFeedback(direction: Vector2): void {
            const { entity: owner, simulation } = this.context;

            if (this.settings.sound) {
                  owner.presentation.emit("sound", { cue: this.settings.sound });
            }

            const netMagnitude = Math.hypot(direction.x, direction.y);
            if (this.settings.recoil && Number.isFinite(this.settings.recoil) && this.settings.recoil > 0 &&
                  netMagnitude > 1e-12) {
                  const scale = Math.abs(netMagnitude - 1) < 1e-12 ? 1 : Math.min(1, netMagnitude);
                  simulation.combat.knockback(owner, owner, this.settings.recoil * scale, {
                        x: -direction.x,
                        y: -direction.y,
                  });
            }
      }
}

class FireProjectiles implements ScriptOperation {
      private complete = false;
      private started = false;
      readonly rejectionReason = "rejected" as const;
      readonly endReason = "complete" as const;

      constructor(private readonly emitter: ProjectileEmitter, private readonly trajectories: ProjectileEmission) { }

      get isComplete(): boolean { return this.complete; }

      start(_scope: ScriptScope): boolean {
            if (this.started) return this.complete;
            this.started = true;
            this.complete = this.emitter.spawn(this.trajectories) !== null;
            return this.complete;
      }

      advance(_deltaMs: number): number { return 0; }
      cancel(_reason: CancellationReason): void { this.started = true; }
}
