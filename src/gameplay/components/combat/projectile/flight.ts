import type { ProjectileSettings } from "../../../../config/component-settings";
import type { EntityComponent } from "../../../../engine/component";
import type { ContactEvent } from "../../../../engine/contracts";
import type { Entity } from "../../../../engine/entity";
import type { ComponentContext } from "../../../../engine/component";
import type { PresentationLease } from "../../../../presentation/state";
import type { ProjectileEndEvent, ProjectileEvent, ProjectileEventHandlers } from "./events";

/** Complete notification and cleanup even if a callback fails; preserve the first error. */
function completeAll(actions: Array<() => void>): void {
      let failed = false;
      let failure: unknown;
      for (const action of actions) {
            try { action(); }
            catch (error) { if (!failed) failure = error; failed = true; }
      }
      if (failed) throw failure;
}

/** Per-projectile simulation lifetime and contact policy. */
export class ProjectileFlight implements EntityComponent {
      private elapsedMs = 0;
      private rotation = 0;
      private rotationLease: PresentationLease<number> | null = null;
      private releaseContactPolicy: (() => void) | null = null;
      private releaseIgnoredOwner: (() => void) | null = null;
      private readonly hitTargets = new Set<string>();
      private readonly listeners = new Set<ProjectileEventHandlers>();
      private processingContact = false;
      private detached = false;
      private pendingEnd: ProjectileEndEvent | null = null;

      constructor(
            private readonly context: ComponentContext,
            private readonly projectile: Entity,
            private readonly settings: ProjectileSettings,
            private readonly hitSound: string | undefined,
            private readonly sourceId: string,
      ) { }

      subscribe(handlers: ProjectileEventHandlers): () => void {
            if (this.detached || this.projectile.isRemoved)
                  throw new Error("Cannot subscribe to a removed projectile");
            const listener = { ...handlers };
            this.listeners.add(listener);
            return () => { this.listeners.delete(listener); };
      }

      private snapshot(): ProjectileEvent {
            return {
                  projectile: this.projectile,
                  position: Object.freeze({ ...this.projectile.body.position }),
                  nowMs: this.context.simulation.nowMs,
            };
      }

      private notify<E>(select: (handlers: ProjectileEventHandlers) => ((event: E) => void) | undefined,
            event: E): void {
            completeAll([...this.listeners].map(listener => () => {
                  if (this.listeners.has(listener)) select(listener)?.(event);
            }));
      }

      private flushEnd(): void {
            if (this.processingContact || !this.pendingEnd) return;
            const event = this.pendingEnd;
            this.pendingEnd = null;
            try { this.notify(handlers => handlers.onEnd, event); }
            finally { this.listeners.clear(); }
      }

      attach(): void {
            const { projectile, settings } = this;
            this.releaseContactPolicy = projectile.resources.acquireContactPolicy({
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
                  this.rotationLease ??= this.projectile.presentation.acquireRotation();
                  this.rotationLease.set(this.rotation);
            }
      }

      contact(event: ContactEvent): void {
            if (this.detached || this.processingContact || !this.projectile.isAlive) return;
            event.policy.allowImpactDamage = false;
            this.processingContact = true;
            completeAll([
                  () => {
                        if (event.kind === "wall") this.handleWallContact(event);
                        else this.handleEntityContact(event.other);
                  },
                  () => { this.processingContact = false; this.flushEnd(); },
            ]);
      }

      private handleWallContact(event: Extract<ContactEvent, { kind: "wall" }>): void {
            if (this.settings.flight.collision.walls === "ignore") {
                  event.policy.defaultBounce = false;
            }
            this.notify(handlers => handlers.onWall,
                  Object.freeze({ ...this.snapshot(), wall: event.wall }));
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

            const snapshot = this.snapshot();
            completeAll([() => {
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
                  this.notify(handlers => handlers.onImpact, Object.freeze({
                        ...snapshot, other,
                        result: Object.freeze({ ...result, statusesApplied: Object.freeze([...result.statusesApplied]) }),
                  }));
            }, () => {
                  if (collision.enemyContact === "consume") context.simulation.remove(projectile.runtimeId, "hit");
            }]);
      }

      detach(): void {
            if (this.detached) return;
            this.detached = true;
            const reason = this.projectile.removalReason;
            if (reason) this.pendingEnd = Object.freeze({ ...this.snapshot(), reason });
            completeAll([
                  () => { this.rotationLease?.release(); this.rotationLease = null; },
                  () => { this.releaseIgnoredOwner?.(); this.releaseIgnoredOwner = null; },
                  () => { this.releaseContactPolicy?.(); this.releaseContactPolicy = null; },
                  () => {
                        this.hitTargets.clear();
                        if (reason) this.flushEnd();
                        else this.listeners.clear();
                  },
            ]);
      }
}
