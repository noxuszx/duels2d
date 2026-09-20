import { Howl } from "howler";
import * as Matter from "matter-js";
import type {
      Facing,
      FighterConfig,
      FighterLines,
      ImageCrop,
      PoseOverrides,
      Vector2,
} from "../types/fighter";
import { getAspectFitCropDrawRect } from "../rendering/sprite-geometry";
import type { WeaponConfig } from "../types/weapon";
import type { GameConfig, SoundManifest } from "../types/game";

type Point = Vector2;
type WeaponState = "idle" | "windup" | "active" | "recovery";
type SoundEntry = string | { path: string };
type SoundPools = Record<string, Howl[]>;

type PoseVisual = Partial<PoseOverrides>;

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

interface CurrentSprite {
      image: HTMLImageElement;
      imageScale: number;
      imageOffset: Point;
      imageCrop: ImageCrop | null;
}

export class Fighter {
      private static sharedSoundPoolCache: SoundPools | null = null;
      private readonly gameConfig: GameConfig;
      private readonly soundManifest: SoundManifest;

      readonly id: string;
      readonly name: string;
      readonly maxHealth: number;
      currentHealth: number;
      readonly color: string;
      readonly radius: number;
      readonly hitbox: NormalizedHitbox;
      readonly baseDamage: number;
      readonly baseSpeed: number;
      knockbackOwnerId: string | null = null;
      private pendingForce: Point = { x: 0, y: 0 };
      private uprightAssistAfter = 0;
      readonly hitboxOffset: Point;
      hitFlashTimer = 0;
      attackTimer = 0;
      private lastHitTime = 0;
      readonly weapon: WeaponConfig | null;
      weaponState: WeaponState = "idle";
      weaponTimer = 0;
      lastWeaponUseTime = -Infinity;
      lastIdleSoundTime = performance.now();
      readonly defaultFacing: Facing;
      facing: Facing;
      readonly faceTarget: { mode: "never" | "always" | "range" };
      readonly body: Matter.Body;
      readonly imageScale: number;
      readonly imageOffset: Point;
      readonly imageCrop: ImageCrop | null;
      sprite: HTMLImageElement | null = null;
      readonly sprites: Record<
            "idle" | "attackWindup" | "attackActive",
            HTMLImageElement | null
      > = {
            idle: null,
            attackWindup: null,
            attackActive: null,
      };
      private readonly poseVisuals: Partial<
            Record<"idle" | "attackWindup" | "attackActive", PoseVisual>
      > = {};
      readonly weaponOffset: Point;
      readonly weaponScale: number;
      weaponIdle: HTMLImageElement | null = null;
      weaponAttack: HTMLImageElement | null = null;
      readonly healthBarOffset: Point;
      readonly soundPools: SoundPools;
      readonly sharedSoundPools: SoundPools;
      private readonly soundCooldowns: Record<string, number> = {};
      readonly lines: FighterLines;
      lastAmbientLineTime = performance.now();
      lastAmbientSoundTime = performance.now();

      constructor(
            config: FighterConfig,
            spawnX: number,
            spawnY: number,
            velX: number,
            velY: number,
            gameConfig: GameConfig,
            soundManifest: SoundManifest,
      ) {
            this.gameConfig = gameConfig;
            this.soundManifest = soundManifest;
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
            this.weapon = config.weapon;
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

            this.imageScale = config.imageScale;
            this.imageOffset = config.imageOffset;
            this.imageCrop = config.imageCrop;
            if (config.image) this.loadImage("sprite", config.image);

            this.loadPose("idle", config.poses?.idle, config.image);
            this.loadPose(
                  "attackWindup",
                  config.poses?.attackWindup,
                  config.image,
            );
            this.loadPose(
                  "attackActive",
                  config.poses?.attackActive,
                  config.image,
            );

            this.weaponOffset = config.weaponOffset;
            this.weaponScale = config.weaponScale;
            if (config.weaponIdle)
                  this.loadImage("weaponIdle", config.weaponIdle);
            if (config.weaponAttack)
                  this.loadImage("weaponAttack", config.weaponAttack);
            this.healthBarOffset = config.healthBarOffset;
            this.soundPools = this.createSoundPools();
            this.sharedSoundPools = Fighter._getSharedSoundPools(
                  this.soundManifest,
                  this.gameConfig,
            );
            this.lines = config.lines ?? {};
      }

      private loadPose(
            key: "idle" | "attackWindup" | "attackActive",
            value: string | PoseVisual | undefined,
            fallbackImage: string | null,
      ): void {
            if (!value) return;
            const path =
                  typeof value === "string"
                        ? value
                        : (value.image ?? fallbackImage);
            if (path) this.loadImage(`sprites.${key}`, path);
            this.poseVisuals[key] = typeof value === "object" ? value : {};
      }

      private loadImage(
            key:
                  | "sprite"
                  | "weaponIdle"
                  | "weaponAttack"
                  | `sprites.${"idle" | "attackWindup" | "attackActive"}`,
            src: string,
      ): void {
            const image = new Image();
            image.onload = () => {
                  if (key.startsWith("sprites."))
                        this.sprites[
                              key.slice(8) as
                                    | "idle"
                                    | "attackWindup"
                                    | "attackActive"
                        ] = image;
                  else if (key === "sprite") this.sprite = image;
                  else if (key === "weaponIdle") this.weaponIdle = image;
                  else this.weaponAttack = image;
            };
            image.onerror = () =>
                  console.warn(`[Duels2D] Could not load image: ${src}`);
            image.src = src;
      }

      getCurrentSprite(): CurrentSprite | null {
            const poseKey =
                  this.weaponState === "windup"
                        ? this.sprites.attackWindup
                              ? "attackWindup"
                              : this.sprites.idle
                                ? "idle"
                                : null
                        : this.weaponState === "active"
                          ? this.sprites.attackActive
                                ? "attackActive"
                                : this.sprites.attackWindup
                                  ? "attackWindup"
                                  : this.sprites.idle
                                    ? "idle"
                                    : null
                          : this.sprites.idle
                            ? "idle"
                            : null;
            const image =
                  this.weaponState === "windup"
                        ? (this.sprites.attackWindup ??
                          this.sprites.idle ??
                          this.sprite)
                        : this.weaponState === "active"
                          ? (this.sprites.attackActive ??
                            this.sprites.attackWindup ??
                            this.sprites.idle ??
                            this.sprite)
                          : (this.sprites.idle ?? this.sprite);
            if (!image) return null;
            const pose = poseKey ? (this.poseVisuals[poseKey] ?? {}) : {};
            return {
                  image,
                  imageScale: pose.imageScale ?? this.imageScale,
                  imageOffset: pose.imageOffset ?? this.imageOffset,
                  imageCrop: pose.imageCrop ?? this.imageCrop,
            };
      }

      canUseWeapon(nowMs: number): boolean {
            return (
                  this.weapon !== null &&
                  nowMs - this.lastWeaponUseTime >=
                        (this.weapon.cooldownMs ?? 0)
            );
      }
      markWeaponUsed(nowMs = performance.now()): void {
            this.lastWeaponUseTime = nowMs;
      }
      applyForceKnockback(
            direction: Point,
            forceMagnitude: number,
            sourceOwnerId: string,
      ): void {
            const length = Math.hypot(direction.x, direction.y) || 1;
            this.knockbackOwnerId = sourceOwnerId;
            this.noteImpact();
            this.pendingForce.x +=
                  (direction.x / length) * forceMagnitude;
            this.pendingForce.y +=
                  (direction.y / length) * forceMagnitude;
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
            const springTorque =
                  angleError * this.body.inertia * 0.000036;
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
                  this.body.velocity.x * unitX +
                  this.body.velocity.y * unitY;
            const targetSpeed = this.baseSpeed * Math.max(1, speedMultiplier);
            if (forwardSpeed >= targetSpeed) return;
            const remaining = Math.max(0, 1 - forwardSpeed / targetSpeed);
            this.knockbackOwnerId = null;
            Matter.Body.applyForce(this.body, this.body.position, {
                  x: unitX * forceMagnitude * remaining,
                  y: unitY * forceMagnitude * remaining,
            });
      }

      startWeaponAnimation(): void {
            if (!this.weapon?.animation) return;
            this.weaponState = "windup";
            this.weaponTimer = this.weapon.animation.windupFrames ?? 0;
            this.attackTimer = this.weapon.animation.windupFrames ?? 0;
            this.playSound("attackWindup", 0);
      }

      updateWeaponState(): void {
            if (!this.weapon || this.weaponTimer <= 0) return;
            if (
                  this.weaponState === "active" &&
                  this.weapon.type === "proximity-melee" &&
                  this.weapon.dash &&
                  "untilCollision" in this.weapon.dash &&
                  this.weapon.dash.untilCollision
            )
                  return;
            this.weaponTimer--;
            if (this.weaponState === "windup" && this.weaponTimer <= 0) {
                  this.weaponState = "active";
                  this.weaponTimer = this.weapon.animation?.activeFrames ?? 0;
                  this.attackTimer = this.weapon.animation?.activeFrames ?? 0;
                  this.playSound("attackActive", 0);
            } else if (this.weaponState === "active" && this.weaponTimer <= 0) {
                  this.weaponState = "recovery";
                  this.weaponTimer = this.weapon.animation?.recoveryFrames ?? 0;
            } else if (this.weaponState === "recovery" && this.weaponTimer <= 0)
                  this.weaponState = "idle";
      }

      finishWeaponActive(): void {
            if (this.weaponState !== "active") return;
            this.weaponState = "recovery";
            this.weaponTimer = this.weapon?.animation?.recoveryFrames ?? 0;
            if (this.weaponTimer <= 0) this.weaponState = "idle";
      }

      updateAudio(nowMs: number): void {
            if (this.isDead || this.weaponState !== "idle") return;
            this.updateAmbientAudio(nowMs);
            if (
                  nowMs - this.lastIdleSoundTime <
                  (this.gameConfig.audio?.idleIntervalMs ?? 4000)
            )
                  return;
            this.lastIdleSoundTime = nowMs;
            this.playSound("idle", 0);
      }

      private updateAmbientAudio(nowMs: number): void {
            const pool = this.soundPools.ambient;
            if (
                  !pool ||
                  pool.length === 0 ||
                  pool.some((sound) => sound.playing())
            )
                  return;
            const audio = this.gameConfig.audio ?? {};
            if (
                  nowMs - this.lastAmbientSoundTime <
                  (audio.ambientIntervalMs ?? audio.idleIntervalMs ?? 4000)
            )
                  return;
            this.lastAmbientSoundTime = nowMs;
            this.playSound("ambient", 0);
      }

      get visualPosition(): Point {
            return {
                  x: this.body.position.x - this.hitboxOffset.x,
                  y: this.body.position.y - this.hitboxOffset.y,
            };
      }

      _getCropDrawRect(
            image: HTMLImageElement,
            crop: ImageCrop | null,
            drawRadius: number,
      ): {
            dx: number;
            dy: number;
            dw: number;
            dh: number;
            crop: Required<ImageCrop>;
      } {
            const safeCrop = this.getImageCrop(image, crop);
            const destination = getAspectFitCropDrawRect(
                  image.naturalWidth,
                  image.naturalHeight,
                  safeCrop,
                  drawRadius,
            );
            return {
                  ...destination,
                  crop: safeCrop,
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

      private getImageCrop(
            image: HTMLImageElement,
            crop: ImageCrop | null,
      ): Required<ImageCrop> {
            const fallback = {
                  x: 0,
                  y: 0,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
            };
            if (!crop) return fallback;
            const naturalWidth = image.naturalWidth || fallback.width || 1;
            const naturalHeight = image.naturalHeight || fallback.height || 1;
            const x = Math.max(0, Math.min(crop.x ?? 0, naturalWidth - 1));
            const y = Math.max(0, Math.min(crop.y ?? 0, naturalHeight - 1));
            return {
                  x,
                  y,
                  width: Math.max(
                        1,
                        Math.min(crop.width ?? naturalWidth, naturalWidth - x),
                  ),
                  height: Math.max(
                        1,
                        Math.min(
                              crop.height ?? naturalHeight,
                              naturalHeight - y,
                        ),
                  ),
            };
      }

      private static resolveSoundSource(entry: SoundEntry): string {
            return typeof entry === "string" ? entry : entry.path;
      }
      private createSoundPools(): SoundPools {
            return Fighter.buildSoundPools(
                  this.soundManifest.characters[this.id] ?? {},
                  this.gameConfig,
            );
      }
      static _getSharedSoundPools(
            soundManifest: SoundManifest,
            gameConfig: GameConfig,
      ): SoundPools {
            if (!Fighter.sharedSoundPoolCache)
                  Fighter.sharedSoundPoolCache = Fighter.buildSoundPools(
                        soundManifest.shared,
                        gameConfig,
                  );
            return Fighter.sharedSoundPoolCache;
      }
      private static buildSoundPools(
            manifest: Record<string, SoundEntry[]>,
            gameConfig: GameConfig,
      ): SoundPools {
            const pools: SoundPools = {};
            Object.entries(manifest).forEach(([type, entries]) => {
                  if (entries.length > 0)
                        pools[type] = entries.map(
                              (entry) =>
                                    new Howl({
                                          src: [
                                                Fighter.resolveSoundSource(
                                                      entry,
                                                ),
                                          ],
                                          volume: Fighter.volumeForSoundType(
                                                type,
                                                gameConfig,
                                          ),
                                    }),
                        );
            });
            return pools;
      }
      private static volumeForSoundType(
            type: string,
            gameConfig: GameConfig,
      ): number {
            const audio = gameConfig.audio ?? {};
            if (audio.volumes?.[type] != null) return audio.volumes[type];
            if (type === "body-bounce") return audio.bounceVolume ?? 0.55;
            return type === "death" ? 0.9 : 0.65;
      }

      setFacingToward(target: Fighter | null): void {
            if (target)
                  this.facing =
                        target.body.position.x < this.body.position.x
                              ? "left"
                              : "right";
      }
      playSound(type: string, cooldownMs: number | null = null): void {
            const pool = this.soundPools[type] ?? this.sharedSoundPools[type];
            if (!pool || pool.length === 0) return;
            const audio = this.gameConfig.audio ?? {};
            const cooldown =
                  cooldownMs ??
                  audio.defaultCooldownMs ??
                  audio.bounceCooldownMs ??
                  80;
            const now = performance.now();
            if (
                  cooldown > 0 &&
                  now - (this.soundCooldowns[type] ?? 0) < cooldown
            )
                  return;
            this.soundCooldowns[type] = now;
            const sound = pool[Math.floor(Math.random() * pool.length)];
            if (type === "hurt")
                  sound.rate([0.85, 1, 1.15][Math.floor(Math.random() * 3)]);
            sound.play();
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
            Object.values(this.soundPools).forEach((pool) =>
                  pool.forEach((sound) => {
                        sound.stop();
                        sound.unload();
                  }),
            );
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
