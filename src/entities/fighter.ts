import * as Matter from "matter-js";
import type {
      Facing,
      FighterConfig,
      FighterLines,
      Vector2,
} from "../types/fighter";
import type { AbilityConfig, AbilityState } from "../abilities/types";
import type { GameConfig, SoundManifest } from "../types/game";
import { FighterAudio } from "./fighter-audio";
import { FighterPresentation } from "./fighter-presentation";

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
      private readonly lastAbilityUseTimes = new Map<string, number>();

      readonly id: string;
      readonly name: string;
      readonly maxHealth: number;

      readonly color: string;
      readonly radius: number;
      readonly hitbox: NormalizedHitbox;
      readonly baseDamage: number;
      readonly baseSpeed: number;
      readonly defaultFacing: Facing;
      readonly hitboxOffset: Point;
      readonly abilities: AbilityConfig[];

      private pendingForce: Point = { x: 0, y: 0 };
      private uprightAssistAfter = 0;
      private lastHitTime = 0;

      readonly body: Matter.Body;
      readonly presentation: FighterPresentation;
      readonly audio: FighterAudio;
      readonly lines: FighterLines;
      readonly faceTarget: { mode: "never" | "always" | "range" };

      abilityState: AbilityState = "idle";
      abilityFacing: Facing | null = null;
      activeAbility: AbilityConfig | null = null;
      knockbackOwnerId: string | null = null;

      abilityTimer = 0;
      hitFlashTimer = 0;
      attackTimer = 0;
      currentHealth: number;
      facing: Facing;

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
            this.id = config.id;
            this.name = config.name;
            this.maxHealth = config.maxHealth;
            this.currentHealth = config.maxHealth;
            this.color = config.color;
            this.radius = config.radius;
            this.hitbox = this.normalizeHitbox(config);
            this.baseDamage = config.baseDamage;
            this.baseSpeed = Math.hypot(velX, velY);
            this.hitboxOffset = config.hitboxOffset;
            this.abilities = config.abilities;
            this.defaultFacing = config.defaultFacing;
            this.facing = this.defaultFacing;
            this.faceTarget = config.faceTarget;

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
                                spawnX + this.hitboxOffset.x,
                                spawnY + this.hitboxOffset.y,
                                this.hitbox.width,
                                this.hitbox.height,
                                bodyOptions,
                          )
                        : Matter.Bodies.circle(
                                spawnX + this.hitboxOffset.x,
                                spawnY + this.hitboxOffset.y,
                                this.hitbox.radius,
                                bodyOptions,
                          );
            Matter.Body.setVelocity(this.body, { x: velX, y: velY });

            this.presentation = new FighterPresentation(config);
            this.audio = new FighterAudio(this.id, gameConfig, soundManifest);
            this.lines = config.lines ?? {};
      }

      getSwingAngle(): number | null {
            const swing = this.activeAbility?.actions.find(
                  (action) => action.type === "swing",
            );
            if (!swing || swing.type !== "swing") return null;

            let degrees = swing.startDegrees;
            if (this.abilityState === "active") {
                  const totalFrames = Math.max(
                        1,
                        this.activeAbility?.timing.activeFrames ?? 1,
                  );
                  const progress = Math.max(
                        0,
                        Math.min(1, 1 - this.abilityTimer / totalFrames),
                  );
                  degrees += (swing.endDegrees - swing.startDegrees) * progress;
            } else if (this.abilityState === "recovery") {
                  degrees = swing.endDegrees;
            }
            return (degrees * Math.PI) / 180;
      }

      canUseAbility(ability: AbilityConfig, nowMs: number): boolean {
            return (
                  nowMs -
                        (this.lastAbilityUseTimes.get(ability.id) ??
                              -Infinity) >=
                  ability.timing.cooldownMs
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

      startAbility(ability: AbilityConfig, nowMs = performance.now()): void {
            this.activeAbility = ability;
            this.abilityFacing = this.facing;
            this.lastAbilityUseTimes.set(ability.id, nowMs);
            this.abilityState = "windup";
            this.abilityTimer = ability.timing.windupFrames;
            this.attackTimer = ability.timing.windupFrames;
            this.playSound("attackWindup", 0);
      }

      lockAbilityFacingToward(target: Fighter): void {
            this.abilityFacing =
                  target.body.position.x < this.body.position.x
                        ? "left"
                        : "right";
      }

      updateAbilityState(): void {
            if (!this.activeAbility || this.abilityTimer <= 0) return;
            if (
                  this.abilityState === "active" &&
                  this.activeAbility.actions.some(
                        (action) =>
                              action.type === "dash" && action.endOn.length > 0,
                  )
            )
                  return;
            this.abilityTimer--;
            if (this.abilityState === "windup" && this.abilityTimer <= 0) {
                  this.abilityState = "active";
                  this.abilityTimer = this.activeAbility.timing.activeFrames;
                  this.attackTimer = this.activeAbility.timing.activeFrames;
                  this.playSound("attackActive", 0);
            } else if (
                  this.abilityState === "active" &&
                  this.abilityTimer <= 0
            ) {
                  this.abilityState = "recovery";
                  this.abilityTimer = this.activeAbility.timing.recoveryFrames;
            } else if (
                  this.abilityState === "recovery" &&
                  this.abilityTimer <= 0
            ) {
                  this.abilityState = "idle";
                  this.activeAbility = null;
                  this.abilityFacing = null;
            }
      }

      finishAbilityActive(): void {
            if (this.abilityState !== "active" || !this.activeAbility) return;
            this.abilityState = "recovery";
            this.abilityTimer = this.activeAbility.timing.recoveryFrames;
            if (this.abilityTimer <= 0) {
                  this.abilityState = "idle";
                  this.activeAbility = null;
                  this.abilityFacing = null;
            }
      }

      updateAudio(nowMs: number): void {
            this.audio.update(
                  nowMs,
                  !this.isDead && this.abilityState === "idle",
            );
      }

      get visualPosition(): Point {
            return {
                  x: this.body.position.x - this.hitboxOffset.x,
                  y: this.body.position.y - this.hitboxOffset.y,
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
            this.hitFlashTimer = 8;
            this.attackTimer = 12;
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
            return this.currentHealth / this.maxHealth;
      }
      getRandomLine(type: string): string | null {
            const lines = this.lines[type];
            return Array.isArray(lines) && lines.length > 0
                  ? lines[Math.floor(Math.random() * lines.length)]
                  : null;
      }
}
