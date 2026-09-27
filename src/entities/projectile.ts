import * as Matter from "matter-js";
import type { ProjectileConfig } from "../abilities/types";

export type { ProjectileConfig } from "../abilities/types";

interface ProjectileOwner {
      id: string;
}

export class Projectile {
      readonly ownerId: string;
      readonly damage: number;
      readonly lifetimeMs: number;
      image: HTMLImageElement | null = null;
      readonly radius: number;
      readonly imageScale: number;
      dead = false;
      readonly body: Matter.Body;
      readonly rotationSpeed: number;
      readonly hitSoundCue: string | null;
      angle: number;
      private ageMs = 0;

      constructor(
            config: ProjectileConfig,
            owner: ProjectileOwner,
            x: number,
            y: number,
            vx: number,
            vy: number,
            hitSoundCue: string | null = null,
      ) {
            this.ownerId = owner.id;
            this.damage = config.damage;
            this.lifetimeMs = config.lifetimeMs;
            this.radius = config.radius;
            this.imageScale = 1;
            const hasKnockback = config.knockback !== false;
            this.body = Matter.Bodies.circle(x, y, config.radius, {
                  isSensor: !hasKnockback,
                  restitution: hasKnockback ? 1 : 0,
                  friction: 0,
                  frictionAir: 0,
                  frictionStatic: 0,
                  inertia: Infinity,
                  inverseInertia: 0,
                  label: `projectile:${owner.id}`,
                  collisionFilter: { category: 0x0002, mask: 0x0001 },
            });
            Matter.Body.setVelocity(this.body, { x: vx, y: vy });
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

      update(deltaMs: number): void {
            this.ageMs += deltaMs;
            if (this.rotationSpeed)
                  this.angle += this.rotationSpeed * (deltaMs / (1000 / 60));
      }

      get expired(): boolean {
            return (
                  this.dead ||
                  this.ageMs >= this.lifetimeMs
            );
      }
}
