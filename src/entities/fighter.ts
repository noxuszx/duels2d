import * as Matter from "matter-js";
import { AimSkill } from "../skills/aim-skill";
import type { Facing, FighterConfig, FighterSkills, Vector2 } from "../types/fighter";
import type { GameConfig, SoundManifest } from "../types/game";
import { FighterAudio } from "./fighter-audio";
import { FighterPresentation } from "./fighter-presentation";
import { FighterAbilities } from "./fighter-abilities";
import type { FighterBehavior } from "../behaviors/fighter-behavior";
import { StatusEffectController } from "../status-effects";
import { TransformationController } from "../transformations";
import type { AbilityConfig } from "../abilities/types";
import type {
      StatusApplicationResult,
      StatusEffectApplication,
} from "../status-effects";

export { getRandomPitch } from "./fighter-audio";
export type { PitchVariationOptions } from "./fighter-audio";

type Point = Vector2;

const PHYSICS_BASE_STEP_MS = 1000 / 60;
const SIMULATION_STEP_MS = 1000 / 120;
const FORCE_SCALE = (PHYSICS_BASE_STEP_MS / SIMULATION_STEP_MS) ** 2;

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
      private lastHitTime = -Infinity;

      readonly id: string;
      readonly config: FighterConfig;
      readonly hitbox: NormalizedHitbox;
      readonly baseSpeed: number;
      readonly body: Matter.Body;
      readonly presentation: FighterPresentation;
      readonly audio: FighterAudio;
      readonly abilities: FighterAbilities;
      readonly aimSkill: AimSkill | null;
      readonly statuses = new StatusEffectController();
      readonly transformation: TransformationController;

      behavior: FighterBehavior | null = null;
      currentHealth: number;
      facing: Facing;
      knockbackOwnerId: string | null = null;
      lastAmbientLineTime = 0;

      constructor(
            config: FighterConfig,
            spawnX: number,
            spawnY: number,
            velX: number,
            velY: number,
            gameConfig: GameConfig,
            soundManifest: SoundManifest,
            private readonly now: () => number = () => performance.now(),
      ) {
            this.config = config;
            this.aimSkill = config.skills?.aim || config.transformation?.skills?.aim
                  ? new AimSkill() : null;
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
            this.transformation = new TransformationController(config.transformation);
            this.audio = new FighterAudio(this.id, gameConfig, soundManifest, now);
            this.abilities = new FighterAbilities(
                  (ability, event) => this.audio.playAbilityCue(ability, event),
                  (ability, event) => this.audio.stopAbilityCue(ability, event),
                  () => this.canStartAbility(),
            );
      }

      get activeAbilities(): readonly AbilityConfig[] {
            return this.transformation.isTransformed && this.transformation.config
                  ? this.transformation.config.abilities
                  : this.config.abilities;
      }

      get activeSkills(): FighterSkills | undefined {
            return this.transformation.isTransformed
                  ? this.transformation.config?.skills ?? this.config.skills
                  : this.config.skills;
      }

      /** Applies an automatic transformation and synchronizes runtime collaborators. */
      updateTransformation(deltaMs = 0): boolean {
            const wasTransformed = this.transformation.isTransformed;
            const started = this.transformation.update(
                  this.currentHealth, this.config.maxHealth, deltaMs,
            );
            if (started) this.interruptForTransformation();
            this.syncTransformationPresentation();
            if (!wasTransformed && this.transformation.isTransformed)
                  this.behavior?.onTransform();
            return started;
      }

      /** Public boundary for behavior- or action-driven transformations. */
      transform(): boolean {
            if (this.isDead) return false;
            if (!this.transformation.transform()) return false;
            this.interruptForTransformation();
            this.syncTransformationPresentation();
            if (this.transformation.isTransformed) this.behavior?.onTransform();
            return true;
      }

      private interruptForTransformation(): void {
            this.aimSkill?.stop();
            this.behavior?.reset();
            this.abilities.reset();
      }

      private syncTransformationPresentation(): void {
            this.presentation.setTransformed(this.transformation.isTransformed);
            this.presentation.setTransformationPose(this.transformation.currentPose);
      }

      resetTransformation(): void {
            this.aimSkill?.stop();
            this.transformation.reset();
            this.presentation.setTransformed(false);
            this.presentation.setTransformationPose(null);
      }

      canStartAbility(): boolean {
            if (this.isDead || this.transformation.isTransforming ||
                  !this.statuses.canStartAbilities) return false;
            const speed = Math.hypot(
                  this.body.velocity.x,
                  this.body.velocity.y,
            );
            return speed <= this.baseSpeed * 2;
      }

      applyStatus(application: StatusEffectApplication): StatusApplicationResult {
            const result = this.statuses.apply(application);
            if (result.applied && !this.statuses.canContinueAbility) {
                  this.aimSkill?.stop();
                  this.behavior?.reset();
                  // The default behavior reset clears its targeting runtime only.
                  // Reset centrally as well; cooldown timestamps are retained.
                  this.abilities.reset();
            }
            return result;
      }

      applyForceKnockback(
            direction: Point,
            forceMagnitude: number,
            sourceOwnerId: string,
            nowMs = this.now(),
      ): void {
            const length = Math.hypot(direction.x, direction.y) || 1;
            this.knockbackOwnerId = sourceOwnerId;
            this.noteImpact(nowMs);
            this.pendingForce.x += (direction.x / length) * forceMagnitude;
            this.pendingForce.y += (direction.y / length) * forceMagnitude;
      }

      /** Queues unattributed source-side force, used by recoil and similar movement. */
      applyRecoil(
            direction: Point,
            forceMagnitude: number,
            nowMs = this.now(),
      ): void {
            const length = Math.hypot(direction.x, direction.y) || 1;
            this.noteImpact(nowMs);
            this.pendingForce.x += (direction.x / length) * forceMagnitude;
            this.pendingForce.y += (direction.y / length) * forceMagnitude;
      }

      applyPendingForce(): void {
            if (this.pendingForce.x === 0 && this.pendingForce.y === 0) return;
            Matter.Body.applyForce(
                  this.body,
                  this.body.position,
                  {
                        x: this.pendingForce.x * FORCE_SCALE,
                        y: this.pendingForce.y * FORCE_SCALE,
                  },
            );
            this.pendingForce = { x: 0, y: 0 };
      }

      noteImpact(nowMs = this.now()): void {
            const gracePeriodMs = 500 + Math.random() * 1500;
            this.uprightAssistAfter = nowMs + gracePeriodMs;
      }

      applyUprightTorque(nowMs = this.now()): void {
            if (nowMs < this.uprightAssistAfter) return;

            const angleError = Math.atan2(
                  Math.sin(-this.body.angle),
                  Math.cos(-this.body.angle),
            );
            const springTorque =
                  angleError * this.body.inertia * 0.000036 * FORCE_SCALE;
            const dampingTorque =
                  this.body.angularVelocity * this.body.inertia * 0.00043 *
                  FORCE_SCALE;
            const maxTorque = this.body.inertia * 0.00008 * FORCE_SCALE;
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
                  (SIMULATION_STEP_MS * SIMULATION_STEP_MS);
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
                  x: unitX * forceMagnitude * remaining * FORCE_SCALE,
                  y: unitY * forceMagnitude * remaining * FORCE_SCALE,
            });
      }

      updateAudio(nowMs: number): void {
            this.audio.update(
                  nowMs,
                  !this.isDead && this.abilities.state === "idle",
            );
      }

      updateAim(target: Fighter | null): void {
            if (!this.aimSkill) return;
            const aim = this.activeSkills?.aim;
            if (!aim || this.isDead || this.transformation.isTransforming || !this.statuses.canContinueAbility ||
                  this.behavior?.isWallCrawling()) {
                  this.aimSkill.stop();
                  return;
            }
            if (target && !target.isDead) this.setFacingToward(target);
            const sprite = this.presentation.getCurrentSprite(this.abilities.state);
            const offset = sprite?.imageOffset ?? this.config.imageOffset;
            this.aimSkill.update({
                  center: { x: this.visualPosition.x + offset.x, y: this.visualPosition.y + offset.y },
                  facing: this.facing,
                  defaultFacing: this.config.defaultFacing,
            }, target && !target.isDead ? target.body.position : null,
            sprite?.aim ?? aim);
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
      isKnockbackFrom(ownerId: string, nowMs = this.now()): boolean {
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
