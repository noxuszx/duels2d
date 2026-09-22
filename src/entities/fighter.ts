import * as Matter from "matter-js";
import type { Facing, FighterConfig, Vector2 } from "../types/fighter";
import type { GameConfig, SoundManifest } from "../types/game";
import { FighterAudio } from "./fighter-audio";
import { FighterPresentation } from "./fighter-presentation";
import { FighterAbilities } from "./fighter-abilities";

export { getRandomPitch } from "./fighter-audio";
export type { PitchVariationOptions } from "./fighter-audio";

type Point = Vector2;

type NormalizedHitbox =
      | {
              type: "box";
              width: number;
              height: number;
              halfWidth: number;
              halfHeight: number;
        }
      | {
              type: "circle";
              radius: number;
              halfWidth: number;
              halfHeight: number;
        };

export class Fighter {
      private pendingForce: Point = { x: 0, y: 0 };
      private uprightAssistAfter = 0;
      private lastHitTime = 0;

      readonly id: string;
      readonly config: FighterConfig;
      readonly hitbox: NormalizedHitbox;
      readonly baseSpeed: number;
      readonly body: Matter.Body;
      readonly presentation: FighterPresentation;
      readonly audio: FighterAudio;
      readonly abilities: FighterAbilities;

      currentHealth: number;
      facing: Facing;
      knockbackOwnerId: string | null = null;
      lastAmbientLineTime = performance.now();

      constructor(
            config: FighterConfig,
            spawnX: number,
            spawnY: number,
            velX: number,
            velY: number,
            gameConfig: GameConfig,
            soundManifest: SoundManifest,
      ) {
            this.config = config;
            this.id = config.id;
            this.currentHealth = config.maxHealth;
            this.hitbox = this.normalizeHitbox(config);
            this.baseSpeed = Math.hypot(velX, velY);
            this.facing = config.defaultFacing;

            const bodyOptions: Matter.IChamferableBodyDefinition = {
                  restitution: 0.82,
                  friction: 0,
                  frictionAir: 0.018,
                  frictionStatic: 0,
                  label: this.id,
                  collisionFilter: {
                        category: 0x0001,
                        mask: 0x0001 | 0x0002,
                  },
            };
            this.body =
                  this.hitbox.type === "box"
                        ? Matter.Bodies.rectangle(
                                spawnX + this.config.hitboxOffset.x,
                                spawnY + this.config.hitboxOffset.y,
                                this.hitbox.width,
                                this.hitbox.height,
                                bodyOptions,
                          )
                        : Matter.Bodies.circle(
                                spawnX + this.config.hitboxOffset.x,
                                spawnY + this.config.hitboxOffset.y,
                                this.hitbox.radius,
                                bodyOptions,
                          );
            Matter.Body.setVelocity(this.body, { x: velX, y: velY });

            this.presentation = new FighterPresentation(config);
            this.audio = new FighterAudio(this.id, gameConfig, soundManifest);
            this.abilities = new FighterAbilities((ability, event) =>
                  this.audio.playAbilityCue(ability, event),
            );
      }
      applyForceKnockback(
            direction: Point,
            forceMagnitude: number,
            sourceOwnerId: string,
      ): void {
            const length = Math.hypot(direction.x, direction.y) || 1;
            this.knockbackOwnerId = sourceOwnerId;
            this.noteImpact();
            this.pendingForce.x += (direction.x / length) * forceMagnitude;
            this.pendingForce.y += (direction.y / length) * forceMagnitude;
      }

      applyPendingForce(): void {
            if (this.pendingForce.x === 0 && this.pendingForce.y === 0) return;
            Matter.Body.applyForce(
                  this.body,
                  this.body.position,
                  this.pendingForce,
            );
            this.pendingForce = { x: 0, y: 0 };
      }

      noteImpact(nowMs = performance.now()): void {
            const gracePeriodMs = 500 + Math.random() * 1500;
            this.uprightAssistAfter = nowMs + gracePeriodMs;
      }

      applyUprightTorque(nowMs = performance.now()): void {
            if (nowMs < this.uprightAssistAfter) return;

            const angleError = Math.atan2(
                  Math.sin(-this.body.angle),
                  Math.cos(-this.body.angle),
            );
            const springTorque = angleError * this.body.inertia * 0.000036;
            const dampingTorque =
                  this.body.angularVelocity * this.body.inertia * 0.00043;
            const maxTorque = this.body.inertia * 0.00008;
            this.body.torque += Math.max(
                  -maxTorque,
                  Math.min(maxTorque, springTorque - dampingTorque),
            );
      }

      applyCruiseForce(): void {
            const speed = Math.hypot(
                  this.body.velocity.x,
                  this.body.velocity.y,
            );
            if (speed >= this.baseSpeed * 0.98) return;

            const direction =
                  speed > 0.01
                        ? {
                                x: this.body.velocity.x / speed,
                                y: this.body.velocity.y / speed,
                          }
                        : { x: this.facing === "left" ? -1 : 1, y: 0 };
            const deficit = this.baseSpeed - speed;
            const forceMagnitude =
                  (this.body.mass * deficit * 0.25) /
                  ((1000 / 60) * (1000 / 60));
            Matter.Body.applyForce(this.body, this.body.position, {
                  x: direction.x * forceMagnitude,
                  y: direction.y * forceMagnitude,
            });
      }

      applyChargeForce(
            direction: Point,
            forceMagnitude: number,
            speedMultiplier: number,
      ): void {
            const length = Math.hypot(direction.x, direction.y) || 1;
            const unitX = direction.x / length;
            const unitY = direction.y / length;
            const forwardSpeed =
                  this.body.velocity.x * unitX + this.body.velocity.y * unitY;
            const targetSpeed = this.baseSpeed * Math.max(1, speedMultiplier);
            if (forwardSpeed >= targetSpeed) return;
            const remaining = Math.max(0, 1 - forwardSpeed / targetSpeed);
            this.knockbackOwnerId = null;
            Matter.Body.applyForce(this.body, this.body.position, {
                  x: unitX * forceMagnitude * remaining,
                  y: unitY * forceMagnitude * remaining,
            });
      }

      updateAudio(nowMs: number): void {
            this.audio.update(
                  nowMs,
                  !this.isDead && this.abilities.state === "idle",
            );
      }

      get visualPosition(): Point {
            return {
                  x: this.body.position.x - this.config.hitboxOffset.x,
                  y: this.body.position.y - this.config.hitboxOffset.y,
            };
      }

      private normalizeHitbox(config: FighterConfig): NormalizedHitbox {
            const fallbackRadius = config.radius;
            const hitbox = config.hitbox;
            if (hitbox.type === "box") {
                  const width = hitbox.width ?? fallbackRadius * 1.4;
                  const height = hitbox.height ?? fallbackRadius * 2.6;
                  return {
                        type: "box",
                        width,
                        height,
                        halfWidth: width / 2,
                        halfHeight: height / 2,
                  };
            }
            const radius = hitbox.radius ?? fallbackRadius;
            return {
                  type: "circle",
                  radius,
                  halfWidth: radius,
                  halfHeight: radius,
            };
      }

      setFacingToward(target: Fighter | null): void {
            if (target)
                  this.facing =
                        target.body.position.x < this.body.position.x
                              ? "left"
                              : "right";
      }
      playSound(type: string, cooldownMs: number | null = null): void {
            this.audio.play(type, cooldownMs);
      }
      isKnockbackFrom(ownerId: string, nowMs = performance.now()): boolean {
            void nowMs;
            const speed = Math.hypot(
                  this.body.velocity.x,
                  this.body.velocity.y,
            );
            const hasPendingForce =
                  this.pendingForce.x !== 0 || this.pendingForce.y !== 0;
            if (!hasPendingForce && speed <= this.baseSpeed * 1.1) {
                  this.knockbackOwnerId = null;
            }
            return this.knockbackOwnerId === ownerId;
      }
      takeDamage(amount: number, nowMs: number, cooldownMs: number): boolean {
            if (nowMs - this.lastHitTime < cooldownMs) return false;
            this.lastHitTime = nowMs;
            this.currentHealth = Math.max(0, this.currentHealth - amount);
            this.presentation.triggerHitFlash();
            return true;
      }
      destroy(): void {
            this.audio.destroy();
      }
      onDeath(): void {
            this.playSound("death", 0);
      }
      get isDead(): boolean {
            return this.currentHealth <= 0;
      }
      get healthRatio(): number {
            return this.currentHealth / this.config.maxHealth;
      }
      getRandomLine(type: string): string | null {
            const lines = this.config.lines?.[type];
            return Array.isArray(lines) && lines.length > 0
                  ? lines[Math.floor(Math.random() * lines.length)]
                  : null;
      }
}
