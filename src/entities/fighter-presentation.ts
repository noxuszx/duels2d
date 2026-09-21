import type { AbilityState } from "../abilities/types";
import { getAspectFitCropDrawRect } from "../rendering/sprite-geometry";
import type {
      FighterConfig,
      ImageCrop,
      PoseOverrides,
      Vector2,
} from "../types/fighter";

type PoseKey = "idle" | "attackWindup" | "attackActive";
type PoseVisual = Partial<PoseOverrides>;

export interface CurrentSprite {
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
      readonly sprites: Record<PoseKey, HTMLImageElement | null> = {
            idle: null,
            attackWindup: null,
            attackActive: null,
      };
      weaponIdle: HTMLImageElement | null = null;
      weaponAttack: HTMLImageElement | null = null;

      private readonly poseVisuals: Partial<Record<PoseKey, PoseVisual>> = {};

      constructor(config: FighterConfig) {
            this.imageScale = config.imageScale;
            this.imageOffset = config.imageOffset;
            this.imageCrop = config.imageCrop;
            this.weaponOffset = config.weaponOffset;
            this.weaponPivot = config.weaponPivot;
            this.weaponScale = config.weaponScale;
            this.healthBarOffset = config.healthBarOffset;

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
            if (config.weaponIdle)
                  this.loadImage("weaponIdle", config.weaponIdle);
            if (config.weaponAttack)
                  this.loadImage("weaponAttack", config.weaponAttack);
      }

      getCurrentSprite(abilityState: AbilityState): CurrentSprite | null {
            const poseKey = this.currentPoseKey(abilityState);
            const image =
                  abilityState === "windup"
                        ? (this.sprites.attackWindup ??
                          this.sprites.idle ??
                          this.sprite)
                        : abilityState === "active"
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

      private currentPoseKey(abilityState: AbilityState): PoseKey | null {
            if (abilityState === "windup")
                  return this.sprites.attackWindup
                        ? "attackWindup"
                        : this.sprites.idle
                          ? "idle"
                          : null;
            if (abilityState === "active")
                  return this.sprites.attackActive
                        ? "attackActive"
                        : this.sprites.attackWindup
                          ? "attackWindup"
                          : this.sprites.idle
                            ? "idle"
                            : null;
            return this.sprites.idle ? "idle" : null;
      }

      private loadPose(
            key: PoseKey,
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
                  | `sprites.${PoseKey}`,
            src: string,
      ): void {
            const image = new Image();
            image.onload = () => {
                  if (key.startsWith("sprites."))
                        this.sprites[key.slice(8) as PoseKey] = image;
                  else if (key === "sprite") this.sprite = image;
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
