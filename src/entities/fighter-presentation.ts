import type { AbilityState } from "../abilities/types";
import { getAspectFitCropDrawRect } from "../rendering/sprite-geometry";
import type {
      AimSkillOptions,
      FighterConfig,
      ImageCrop,
      PoseOverrides,
      Vector2,
} from "../types/fighter";

type PoseKey = string;
export interface PresentationMotion { x: number; y: number; rotation: number; }
type PoseVisual = Partial<PoseOverrides>;
type PoseBank = {
      sprites: Record<PoseKey, HTMLImageElement | null>;
      visuals: Partial<Record<PoseKey, PoseVisual>>;
};

const createPoseBank = (): PoseBank => ({
      sprites: {
            idle: null,
            attackWindup: null,
            attackActive: null,
            recovery: null,
            crawl1: null,
            crawl2: null,
      },
      visuals: {},
});

export interface CurrentSprite {
      aim?: AimSkillOptions;
      image: HTMLImageElement;
      imageScale: number;
      imageOffset: Vector2;
      imageCrop: ImageCrop | null;
}

/** Owns the browser assets and visual configuration used to draw a fighter. */
export class FighterPresentation {
      readonly imageScale: number;
      readonly imageOffset: Vector2;
      readonly imageCrop: ImageCrop | null;
      readonly weaponOffset: Vector2;
      readonly weaponPivot: Vector2;
      readonly weaponScale: number;
      readonly healthBarOffset: Vector2;

      sprite: HTMLImageElement | null = null;
      weaponIdle: HTMLImageElement | null = null;
      weaponAttack: HTMLImageElement | null = null;
      hitFlashTimer = 0;
      private animationFrame = 0;
      private transformed = false;
      private transformationPose: string | null = null;
      private readonly basePoses = createPoseBank();
      private readonly transformedPoses = createPoseBank();
      private readonly motions = new Map<symbol, PresentationMotion>();

      get motion(): PresentationMotion {
            const sum = { x: 0, y: 0, rotation: 0 };
            for (const motion of this.motions.values()) {
                  sum.x += motion.x;
                  sum.y += motion.y;
                  sum.rotation += motion.rotation;
            }
            return sum;
      }

      acquireMotion(): { set(motion: PresentationMotion): void; release(): void } {
            const owner = Symbol();
            this.motions.set(owner, { x: 0, y: 0, rotation: 0 });
            return {
                  set: (motion) => { if (this.motions.has(owner)) this.motions.set(owner, { ...motion }); },
                  release: () => { this.motions.delete(owner); },
            };
      }

      constructor(config: FighterConfig) {
            this.imageScale = config.imageScale;
            this.imageOffset = config.imageOffset;
            this.imageCrop = config.imageCrop;
            this.weaponOffset = config.weaponOffset;
            this.weaponPivot = config.weaponPivot;
            this.weaponScale = config.weaponScale;
            this.healthBarOffset = config.healthBarOffset;

            if (config.image) this.loadImage("sprite", config.image);
            this.loadPose(this.basePoses, "idle", config.poses?.idle, config.image);
            this.loadPose(
                  this.basePoses,
                  "attackWindup",
                  config.poses?.attackWindup,
                  config.image,
            );
            this.loadPose(
                  this.basePoses,
                  "attackActive",
                  config.poses?.attackActive,
                  config.image,
            );
            this.loadPose(this.basePoses, "recovery", config.poses?.recovery, config.image);
            this.loadPose(this.basePoses, "crawl1", config.poses?.crawl1, config.image);
            this.loadPose(this.basePoses, "crawl2", config.poses?.crawl2, config.image);
            for (const key of Object.keys(config.transformation?.poses ?? {})) {
                  this.loadPose(
                        this.transformedPoses,
                        key,
                        config.transformation?.poses?.[key],
                        config.image,
                  );
            }
            if (config.weaponIdle)
                  this.loadImage("weaponIdle", config.weaponIdle);
            if (config.weaponAttack)
                  this.loadImage("weaponAttack", config.weaponAttack);
      }

      triggerHitFlash(duration = 18): void {
            this.hitFlashTimer = duration;
      }

      update(): void {
            if (this.hitFlashTimer > 0) this.hitFlashTimer--;
            this.animationFrame++;
      }

      get isFlashing(): boolean {
            return this.hitFlashTimer > 0;
      }

      setTransformed(transformed: boolean): void {
            this.transformed = transformed;
      }

      setTransformationPose(pose: string | null): void {
            this.transformationPose = pose;
      }

      getCurrentSprite(abilityState: AbilityState, isCrawling = false): CurrentSprite | null {
            if (this.transformationPose) {
                  const image = this.transformedPoses.sprites[this.transformationPose];
                  if (image) {
                        const pose = this.transformedPoses.visuals[this.transformationPose] ?? {};
                        return {
                              image,
                              aim: pose.aim,
                              imageScale: pose.imageScale ?? this.imageScale,
                              imageOffset: pose.imageOffset ?? this.imageOffset,
                              imageCrop: pose.imageCrop ?? this.imageCrop,
                        };
                  }
            }
            const crawlKey: PoseKey = Math.floor(this.animationFrame / 9) % 2 === 0
                  ? "crawl1"
                  : "crawl2";
            const bank = this.transformed ? this.transformedPoses : this.basePoses;
            const poseKey = isCrawling && bank.sprites[crawlKey]
                  ? crawlKey
                  : this.currentPoseKey(bank, abilityState);
            const image =
                  isCrawling && bank.sprites[crawlKey]
                        ? bank.sprites[crawlKey]
                  : abilityState === "windup"
                        ? (bank.sprites.attackWindup ??
                              bank.sprites.idle ??
                              this.sprite)
                  : abilityState === "active"
                              ? (bank.sprites.attackActive ??
                                    bank.sprites.attackWindup ??
                                    bank.sprites.idle ??
                                    this.sprite)
                  : abilityState === "recovery"
                        ? (bank.sprites.recovery ?? bank.sprites.idle ?? this.sprite)
                        : (bank.sprites.idle ?? this.sprite);
            if (!image) return null;
            const pose = poseKey ? (bank.visuals[poseKey] ?? {}) : {};
            return {
                  image,
                  aim: pose.aim,
                  imageScale: pose.imageScale ?? this.imageScale,
                  imageOffset: pose.imageOffset ?? this.imageOffset,
                  imageCrop: pose.imageCrop ?? this.imageCrop,
            };
      }

      getCropDrawRect(
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
            return {
                  ...getAspectFitCropDrawRect(
                        image.naturalWidth,
                        image.naturalHeight,
                        safeCrop,
                        drawRadius,
                  ),
                  crop: safeCrop,
            };
      }

      private currentPoseKey(bank: PoseBank, abilityState: AbilityState): PoseKey | null {
            if (abilityState === "windup")
                  return bank.sprites.attackWindup
                        ? "attackWindup"
                        : bank.sprites.idle
                              ? "idle"
                              : null;
            if (abilityState === "active")
                  return bank.sprites.attackActive
                        ? "attackActive"
                        : bank.sprites.attackWindup
                              ? "attackWindup"
                              : bank.sprites.idle
                                    ? "idle"
                                    : null;
            if (abilityState === "recovery" && bank.sprites.recovery)
                  return "recovery";
            return bank.sprites.idle ? "idle" : null;
      }

      private loadPose(
            bank: PoseBank,
            key: PoseKey,
            value: string | PoseVisual | undefined,
            fallbackImage: string | null,
      ): void {
            if (!value) return;
            const path =
                  typeof value === "string"
                        ? value
                        : (value.image ?? fallbackImage);
            if (path) this.loadPoseImage(bank, key, path);
            bank.visuals[key] = typeof value === "object" ? value : {};
      }

      private loadPoseImage(bank: PoseBank, key: PoseKey, src: string): void {
            const image = new Image();
            image.onload = () => {
                  bank.sprites[key] = image;
            };
            image.onerror = () =>
                  console.warn(`[Duels2D] Could not load image: ${src}`);
            image.src = src;
      }

      private loadImage(
            key:
                  | "sprite"
                  | "weaponIdle"
                  | "weaponAttack",
            src: string,
      ): void {
            const image = new Image();
            image.onload = () => {
                  if (key === "sprite") this.sprite = image;
                  else if (key === "weaponIdle") this.weaponIdle = image;
                  else this.weaponAttack = image;
            };
            image.onerror = () =>
                  console.warn(`[Duels2D] Could not load image: ${src}`);
            image.src = src;
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
}
