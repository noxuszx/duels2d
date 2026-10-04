import type { ProjectileSettings } from "../../../config/component-settings";
import type { EntityComponent } from "../../../engine/component";
import type { ContactEvent } from "../../../engine/contracts";
import type { Entity } from "../../../engine/entity";
import type { ComponentContext } from "../../fighter-factory";

/** Per-projectile simulation lifetime and contact policy. */
export class ProjectileFlight implements EntityComponent {
      private elapsedMs = 0;
      private rotation = 0;
      private releaseRotation: (() => void) | null = null;
      private releaseIgnoredOwner: (() => void) | null = null;
      private readonly hitTargets = new Set<string>();

      constructor(
            private readonly context: ComponentContext,
            private readonly projectile: Entity,
            private readonly settings: ProjectileSettings,
            private readonly hitSound: string | undefined,
            private readonly sourceId: string,
      ) { }

      attach(): void {
            const { projectile, settings } = this;
            projectile.resources.acquireContactPolicy({
                  allowImpactDamage: false,
                  defaultBounce: settings.flight.collision.walls === "bounce",
            });
            if (settings.flight.collision.ownerContact === "ignore" && projectile.ownerRuntimeId) {
                  this.releaseIgnoredOwner = projectile.resources.acquireIgnoredContact(projectile.ownerRuntimeId);
            }
      }

      beforeStep(deltaMs: number): void {
            if (this.settings.flight.lifetime.type === "duration") {
                  this.elapsedMs += deltaMs;
                  if (this.settings.flight.lifetime.durationMs - this.elapsedMs <= 1e-9) {
                        this.context.simulation.remove(this.projectile.runtimeId, "expired");
                        return;
                  }
            }
            if (this.settings.rotationSpeed) {
                  this.rotation += (this.settings.rotationSpeed * deltaMs) / (1000 / 60);
                  this.releaseRotation?.();
                  this.releaseRotation = this.projectile.presentation.acquireRotation(this.rotation);
            }
      }

      contact(event: ContactEvent): void {
            event.policy.allowImpactDamage = false;

            if (event.kind === "wall") {
                  this.handleWallContact(event);
                  return;
            }

            this.handleEntityContact(event.other);
      }

      private handleWallContact(event: ContactEvent): void {
            if (this.settings.flight.collision.walls === "ignore") {
                  event.policy.defaultBounce = false;
            }
      }

      private handleEntityContact(other: Entity): void {
            const { projectile, context, settings } = this;
            const collision = settings.flight.collision;

            if (other.runtimeId === projectile.ownerRuntimeId) {
                  if (collision.ownerContact === "catch") {
                        context.simulation.remove(projectile.runtimeId, "hit");
                  }
                  return;
            }

            if (!other.isAlive || other.teamId === projectile.teamId || !other.tags.has("targetable")) {
                  return;
            }
            if (this.hitTargets.has(other.runtimeId)) return;
            this.hitTargets.add(other.runtimeId);

            const result = context.simulation.hit(
                  projectile,
                  other,
                  {
                        damage: settings.damage,
                        knockback: settings.flight.knockback?.forceMagnitude,
                  },
                  { sourceId: this.sourceId, independentCooldown: true },
            );

            if (result.connected && this.hitSound && context.simulation.entities.isLive(context.entity)) {
                  context.entity.presentation.emit("sound", { cue: this.hitSound });
            }

            if (collision.enemyContact === "consume") {
                  context.simulation.remove(projectile.runtimeId, "hit");
            }
      }

      detach(): void {
            this.releaseRotation?.();
            this.releaseRotation = null;
            this.releaseIgnoredOwner?.();
            this.releaseIgnoredOwner = null;
            this.hitTargets.clear();
      }
}
