import { Bodies, Body } from "matter-js";
import type { ProjectileEmitterSettings, ProjectileSettings } from "../../config/component-settings";
import type { EntityComponent } from "../../engine/component";
import type { CancellationReason, ContactEvent } from "../../engine/contracts";
import { Entity } from "../../engine/entity";
import type { ScriptOperation } from "../../engine/scripting/operation";
import type { ScriptScope } from "../../engine/scripting/scope";
import type { ComponentContext } from "../fighter-factory";

/** An owner-bound capability. Each spawn owns its own flight state and contact history. */
export class ProjectileEmitter implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: ProjectileEmitterSettings) {}
      attach(): void {}

      /** Inert until admitted by a behavior; a successful shot commits its move cooldown. */
      start(target: Entity): ScriptOperation {
            return new FireProjectile(this, target);
      }

      /** Fires toward a live enemy and returns the registered projectile, or null if firing is invalid. */
      spawn(target: Entity): Entity | null {
            const { entity: owner, simulation } = this.context;
            if (!owner.isAlive || !simulation.isCombatActive || !simulation.entities.isLive(owner) ||
                  !simulation.entities.isLive(target) || !target.tags.has("targetable") ||
                  owner.teamId === target.teamId) return null;
            const shot = this.settings.projectile;
            if (!Number.isFinite(shot.radius) || shot.radius <= 0 ||
                  !Number.isFinite(shot.speed) || shot.speed <= 0 ||
                  !Number.isFinite(shot.damage) || shot.damage < 0 ||
                  (shot.flight.lifetime.type === "duration" &&
                        (!Number.isFinite(shot.flight.lifetime.durationMs) || shot.flight.lifetime.durationMs <= 0)) ||
                  (Array.isArray(shot.image) && shot.image.length === 0)) return null;
            const dx = target.body.position.x - owner.body.position.x;
            const dy = target.body.position.y - owner.body.position.y;
            const length = Math.hypot(dx, dy);
            const direction = length ? { x: dx / length, y: dy / length }
                  : { x: owner.facing === "left" ? -1 : 1, y: 0 };
            const halfWidth = (owner.body.bounds.max.x - owner.body.bounds.min.x) / 2;
            const halfHeight = (owner.body.bounds.max.y - owner.body.bounds.min.y) / 2;
            const offset = Math.hypot(halfWidth, halfHeight) + shot.radius + 1;
            const position = { x: owner.body.position.x + direction.x * offset,
                  y: owner.body.position.y + direction.y * offset };
            const body = Bodies.circle(position.x, position.y, shot.radius, {
                  isSensor: shot.flight.collision.response === "sensor",
                  friction: 0, frictionAir: 0, restitution: 1,
            });
            Body.setInertia(body, Infinity);
            Body.setVelocity(body, { x: direction.x * shot.speed, y: direction.y * shot.speed });
            const image = Array.isArray(shot.image)
                  ? shot.image[Math.floor(simulation.rng.next() * shot.image.length)]
                  : shot.image;
            const config = { ...owner.config,
                  id: `${owner.configId}:projectile`, radius: shot.radius,
                  hitbox: { type: "circle" as const, radius: shot.radius },
                  hitboxOffset: { x: 0, y: 0 },
                  image: image ?? null,
                  imageScale: image ? shot.imageScales?.[image] ?? 1 : 1,
                  imageOffset: { x: 0, y: 0 }, imageCrop: null,
                  healthBarOffset: { x: 0, y: 0 },
                  poses: null, forms: {}, components: {}, moves: {},
                  speed: shot.speed, maxHealth: 1,
            };
            const runtimeId = simulation.nextRuntimeId(`${owner.runtimeId}:projectile`);
            const projectile = new Entity({ runtimeId, configId: config.id,
                  teamId: owner.teamId, ownerId: owner.runtimeId,
                  tags: [], body, config,
                  containWithinArena: shot.flight.collision.walls === "bounce" });
            projectile.components.use("flight", new ProjectileFlight(this.context, projectile, shot,
                  this.settings.hitSound, owner.runtimeId));
            simulation.add(projectile, {
                  ownerDeath: shot.flight.ownership.onOwnerDeath,
                  ownerRemoval: shot.flight.ownership.onOwnerRemoval,
                  matchEnd: shot.flight.ownership.onMatchEnd,
            });
            if (this.settings.sound) owner.presentation.emit("sound", { cue: this.settings.sound });
            if (this.settings.recoil && Number.isFinite(this.settings.recoil) && this.settings.recoil > 0)
                  simulation.combat.knockback(owner, owner, this.settings.recoil,
                        { x: -direction.x, y: -direction.y });
            return projectile;
      }
}

class FireProjectile implements ScriptOperation {
      private complete = false;
      readonly rejectionReason = "rejected" as const;
      readonly endReason = "complete" as const;

      constructor(private readonly emitter: ProjectileEmitter, private readonly target: Entity) {}

      get isComplete(): boolean { return this.complete; }
      start(_scope: ScriptScope): boolean {
            const projectile = this.emitter.spawn(this.target);
            this.complete = projectile !== null;
            return this.complete;
      }
      advance(_deltaMs: number): number { return 0; }
      cancel(_reason: CancellationReason): void {}
}

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
      ) {}

      attach(): void {
            const { projectile, settings } = this;
            projectile.resources.acquireContactPolicy({
                  allowImpactDamage: false,
                  defaultBounce: settings.flight.collision.walls === "bounce",
            });
            if (settings.flight.collision.ownerContact === "ignore" && projectile.ownerRuntimeId)
                  this.releaseIgnoredOwner = projectile.resources.acquireIgnoredContact(projectile.ownerRuntimeId);
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
                  this.rotation += this.settings.rotationSpeed * deltaMs / (1000 / 60);
                  this.releaseRotation?.();
                  this.releaseRotation = this.projectile.presentation.acquireRotation(this.rotation);
            }
      }

      contact(event: ContactEvent): void {
            const { projectile, context, settings } = this;
            const collision = settings.flight.collision;
            event.policy.allowImpactDamage = false;
            if (event.kind === "wall") {
                  if (collision.walls === "ignore") event.policy.defaultBounce = false;
                  return;
            }
            const other = event.other;
            if (other.runtimeId === projectile.ownerRuntimeId) {
                  if (collision.ownerContact === "catch") context.simulation.remove(projectile.runtimeId, "hit");
                  return;
            }
            if (!other.isAlive || other.teamId === projectile.teamId || !other.tags.has("targetable") ||
                  this.hitTargets.has(other.runtimeId)) return;
            this.hitTargets.add(other.runtimeId);
            const result = context.simulation.hit(projectile, other, {
                  damage: settings.damage,
                  knockback: settings.flight.knockback?.forceMagnitude,
            }, { sourceId: this.sourceId, independentCooldown: true });
            if (result.connected && this.hitSound && context.simulation.entities.isLive(context.entity)) {
                  context.entity.presentation.emit("sound", { cue: this.hitSound });
            }
            if (collision.enemyContact === "consume") context.simulation.remove(projectile.runtimeId, "hit");
      }

      detach(): void {
            this.releaseRotation?.();
            this.releaseRotation = null;
            this.releaseIgnoredOwner?.();
            this.releaseIgnoredOwner = null;
            this.hitTargets.clear();
      }
}
