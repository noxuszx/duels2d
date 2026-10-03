import * as Matter from "matter-js";
import { ProjectileFlight, type ProjectileFlightContext, type ProjectileOwner } from "../skills/projectile-flight";
import { projectileFlightSettings } from "../gameplay/projectile-settings";
import type { ProjectileConfig } from "../abilities/types";

export type { ProjectileConfig } from "../abilities/types";

export type ProjectileRemovalReason =
      | "hit" | "caught" | "expired"
      | "owner-death" | "owner-removed" | "match-ended"
      | "interrupted" | "removed" | "reset";

export interface ProjectileOptions {
      onRemoved?: (reason: ProjectileRemovalReason) => void;
}

export class Projectile {
      readonly ownerId: string;
      readonly ownerRuntimeId: string;
      readonly damage: number;
      image: HTMLImageElement | null = null;
      readonly radius: number;
      readonly imageScale: number;
      dead = false;
      readonly body: Matter.Body;
      readonly rotationSpeed: number;
      readonly hitSoundCue: string | null;
      angle: number;
      private removalReasonValue: ProjectileRemovalReason | null = null;
      readonly flight: ProjectileFlight;
      private readonly options: ProjectileOptions;

      constructor(
            config: ProjectileConfig,
            owner: ProjectileOwner,
            x: number,
            y: number,
            vx: number,
            vy: number,
            hitSoundCue: string | null = null,
            options: ProjectileOptions = {},
      ) {
            this.options = { ...options };
            const settings = projectileFlightSettings(config);
            this.ownerId = owner.id;
            this.ownerRuntimeId = owner.runtimeId ?? owner.id;
            this.damage = config.damage;
            this.radius = config.radius;
            this.imageScale = 1;
            const physical = settings.collision.response === "physical";
            this.body = Matter.Bodies.circle(x, y, config.radius, {
                  isSensor: !physical,
                  restitution: physical ? 1 : 0,
                  friction: 0,
                  frictionAir: 0,
                  frictionStatic: 0,
                  inertia: Infinity,
                  inverseInertia: 0,
                  label: `projectile:${owner.id}`,
                  collisionFilter: { group: owner.body?.collisionFilter.group ?? 0, category: 0x0002, mask: 0x0001 },
            });
            Matter.Body.setVelocity(this.body, { x: vx, y: vy });
            this.flight = new ProjectileFlight(this, owner, settings);
            this.rotationSpeed = config.rotationSpeed || 0;
            this.hitSoundCue = hitSoundCue;
            this.angle = 0;
            if (config.image) {
                  const images = Array.isArray(config.image)
                        ? config.image
                        : [config.image];
                  const imagePath =
                        images[Math.floor(Math.random() * images.length)];
                  this.imageScale = config.imageScales?.[imagePath] ?? 1;
                  this.loadImage(imagePath);
            }
      }

      private loadImage(src: string): void {
            const image = new Image();
            image.onload = () => {
                  this.image = image;
            };
            image.onerror = () =>
                  console.warn(
                        `[Duels2D] Could not load projectile image: ${src}`,
                  );
            image.src = src;
      }

      update(deltaMs: number, context: ProjectileFlightContext): void {
            if (this.dead) return;
            if (Number.isFinite(deltaMs) && deltaMs > 0 && this.rotationSpeed)
                  this.angle += this.rotationSpeed * (deltaMs / (1000 / 60));
            this.flight.update(deltaMs, context);
      }

      get removalReason(): ProjectileRemovalReason | null { return this.removalReasonValue; }

      /** Idempotently closes flight before notification. The host removes world/list entries. */
      remove(reason: ProjectileRemovalReason): void {
            if (this.removalReasonValue) return;
            this.removalReasonValue = reason;
            this.dead = true;
            this.flight.dispose();
            const onRemoved = this.options.onRemoved;
            delete this.options.onRemoved;
            onRemoved?.(reason);
      }
}
