'use strict';

class Projectile {
  constructor(config, owner, x, y, vx, vy) {
    this.ownerId = owner.id;
    this.damage = config.damage;
    this.createdAt = performance.now();
    this.lifetimeMs = config.lifetimeMs;
    this.image = null;
    this.radius = config.radius;
    this.dead = false;
    const hasKnockback = config.knockback !== false;
    this.body = Bodies.circle(x, y, config.radius, {
      isSensor: !hasKnockback,
      restitution: hasKnockback ? 1 : 0,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      inertia: Infinity,
      inverseInertia: 0,
      label: `projectile:${owner.id}`,
      collisionFilter: {
        category: 0x0002,
        mask: 0x0001,
      },
    });
    Body.setVelocity(this.body, { x: vx, y: vy });

    this.rotationSpeed = config.rotationSpeed || 0;
    this.angle = config.angle || 0;

    if (config.image) this._loadImage(config.image);
  }

  _loadImage(src) {
    const img = new Image();
    img.onload = () => { this.image = img; };
    img.onerror = () => { console.warn(`[Duels2D] Could not load projectile image: ${src}`); };
    img.src = src;
  }

  update() {
    if (this.rotationSpeed) {
      this.angle += this.rotationSpeed;
    }
  }

  get expired() {
    return this.dead || (performance.now() - this.createdAt) >= this.lifetimeMs;
  }
}
