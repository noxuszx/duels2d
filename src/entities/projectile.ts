import * as Matter from "matter-js";
import type { ProjectileConfig } from "../types/weapon";

export type { ProjectileConfig } from "../types/weapon";

interface ProjectileOwner {
    id: string;
}

export class Projectile {
    readonly ownerId: string;
    readonly damage: number;
    readonly createdAt: number;
    readonly lifetimeMs: number;
    image: HTMLImageElement | null = null;
    readonly radius: number;
    dead = false;
    readonly body: Matter.Body;
    readonly rotationSpeed: number;
    angle: number;

    constructor(
        config: ProjectileConfig,
        owner: ProjectileOwner,
        x: number,
        y: number,
        vx: number,
        vy: number,
    ) {
        this.ownerId = owner.id;
        this.damage = config.damage;
        this.createdAt = performance.now();
        this.lifetimeMs = config.lifetimeMs;
        this.radius = config.radius;
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
        this.angle = 0;
        if (config.image) {
            const images = Array.isArray(config.image)
                ? config.image
                : [config.image];
            this.loadImage(images[Math.floor(Math.random() * images.length)]);
        }
    }

    private loadImage(src: string): void {
        const image = new Image();
        image.onload = () => {
            this.image = image;
        };
        image.onerror = () =>
            console.warn(`[Duels2D] Could not load projectile image: ${src}`);
        image.src = src;
    }

    update(): void {
        if (this.rotationSpeed) this.angle += this.rotationSpeed;
    }

    get expired(): boolean {
        return (
            this.dead || performance.now() - this.createdAt >= this.lifetimeMs
        );
    }
}
