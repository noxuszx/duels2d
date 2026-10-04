import type { ProjectileEmitterSettings, ProjectileSettings } from "../../../config/component-settings";
import type { EntityComponent } from "../../../engine/component";
import type { CancellationReason, Vector2 } from "../../../engine/contracts";
import type { Entity } from "../../../engine/entity";
import type { ScriptOperation } from "../../../engine/scripting/operation";
import type { ScriptScope } from "../../../engine/scripting/scope";
import type { ComponentContext } from "../../fighter-factory";
import type { AimSolution } from "../aim-geometry";

import { createProjectile, type ProjectileTrajectory } from "./factory";

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
            private readonly firingGeometry?: () => AimSolution | null,
      ) { }

      attach(): void { }

      /** Inert until admitted by a behavior; a successful shot commits its move cooldown. */
      start(target: Entity): ScriptOperation {
            return new FireProjectile(this, target);
      }

      /** Fires toward a live enemy and returns the registered projectile, or null if firing is invalid. */
      spawn(target: Entity): Entity | null {
            if (!this.canFireAt(target)) return null;

            const shot = this.settings.projectile;
            if (!isValidProjectileConfig(shot)) return null;

            const trajectory = this.resolveTrajectory(target, shot);
            if (!trajectory) return null;

            const projectile = createProjectile(this.context, shot, trajectory, this.settings.hitSound);
            this.emitFiringFeedback(trajectory.direction);

            return projectile;
      }

      private canFireAt(target: Entity): boolean {
            const { entity: owner, simulation } = this.context;
            return (
                  owner.isAlive &&
                  simulation.isCombatActive &&
                  simulation.entities.isLive(owner) &&
                  simulation.entities.isLive(target) &&
                  target.tags.has("targetable") &&
                  owner.teamId !== target.teamId
            );
      }

      private resolveTrajectory(
            target: Entity,
            shot: ProjectileSettings,
      ): ProjectileTrajectory | null {
            const { entity: owner } = this.context;

            if (this.firingGeometry) {
                  const aim = this.firingGeometry();
                  if (!aim || !isFiniteVector(aim.origin) || !isFiniteVector(aim.direction)) return null;
                  if (Math.abs(Math.hypot(aim.direction.x, aim.direction.y) - 1) > 1e-6) return null;
                  return { position: aim.origin, direction: aim.direction };
            }

            const dx = target.body.position.x - owner.body.position.x;
            const dy = target.body.position.y - owner.body.position.y;
            const distance = Math.hypot(dx, dy);
            const direction: Vector2 = distance > 0
                  ? { x: dx / distance, y: dy / distance }
                  : { x: owner.facing === "left" ? -1 : 1, y: 0 };

            const halfWidth = (owner.body.bounds.max.x - owner.body.bounds.min.x) / 2;
            const halfHeight = (owner.body.bounds.max.y - owner.body.bounds.min.y) / 2;
            const spawnOffset = Math.hypot(halfWidth, halfHeight) + shot.radius + 1;

            const position: Vector2 = {
                  x: owner.body.position.x + direction.x * spawnOffset,
                  y: owner.body.position.y + direction.y * spawnOffset,
            };

            return { position, direction };
      }

      private emitFiringFeedback(direction: Vector2): void {
            const { entity: owner, simulation } = this.context;

            if (this.settings.sound) {
                  owner.presentation.emit("sound", { cue: this.settings.sound });
            }

            if (this.settings.recoil && Number.isFinite(this.settings.recoil) && this.settings.recoil > 0) {
                  simulation.combat.knockback(owner, owner, this.settings.recoil, {
                        x: -direction.x,
                        y: -direction.y,
                  });
            }
      }
}

class FireProjectile implements ScriptOperation {
      private complete = false;
      readonly rejectionReason = "rejected" as const;
      readonly endReason = "complete" as const;

      constructor(private readonly emitter: ProjectileEmitter, private readonly target: Entity) { }

      get isComplete(): boolean { return this.complete; }

      start(_scope: ScriptScope): boolean {
            const projectile = this.emitter.spawn(this.target);
            this.complete = projectile !== null;
            return this.complete;
      }

      advance(_deltaMs: number): number { return 0; }
      cancel(_reason: CancellationReason): void { }
}

