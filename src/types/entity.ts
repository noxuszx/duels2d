export type Facing = "left" | "right";
export interface Vector2 { x: number; y: number; }
export interface ImageCrop { x: number; y: number; width: number; height: number; }
export interface BoxHitbox { type: "box"; width: number; height: number; }
export interface CircleHitbox { type: "circle"; radius: number; }
export type Hitbox = BoxHitbox | CircleHitbox;

export interface AimSkillOptions {
      muzzle: Vector2;
      pivot?: Vector2;
      /** Barrel direction in the authored sprite, degrees clockwise from right. */
      forwardDegrees?: number;
}
export interface PoseOverrides {
      image: string;
      imageCrop?: ImageCrop | null;
      imageScale?: number;
      imageOffset?: Vector2;
      aim?: AimSkillOptions;
}
export type PoseConfig = string | PoseOverrides;
export type EntityPoses = Record<string, PoseConfig> | null;

/** Baseline physical and visual configuration for any entity in the simulation. */
export interface EntityConfig {
      id: string;
      radius: number;
      hitbox: Hitbox;
      hitboxOffset?: Vector2;
      speed: number;
      maxHealth: number;
      /** Collision impact damage scaling: 0 is immune, 1 is normal. Does not affect attacks or physics. */
      impactDamageMultiplier?: number;
      defaultFacing?: Facing;
      image?: string | null;
      imageScale?: number;
      imageOffset?: Vector2;
      imageCrop?: ImageCrop | null;
      healthBarOffset?: Vector2;
      color?: string;
      poses?: EntityPoses;
      /** Optional held visual; aiming can rotate it independently of the body sprite. */
      weaponIdle?: string | null;
      weaponAttack?: string | null;
      weaponScale?: number;
      weaponOffset?: Vector2;
      weaponPivot?: Vector2;
}

/** Common optional fields are resolved once before mechanics use the config. */
export type RuntimeEntityConfig<C extends EntityConfig = EntityConfig> = Readonly<C & Required<Pick<EntityConfig,
      "hitboxOffset" | "defaultFacing" | "image" | "imageScale" | "imageOffset" |
      "imageCrop" | "healthBarOffset" | "color" | "poses" | "impactDamageMultiplier">>>;

export function resolveEntityConfig<C extends EntityConfig>(config: C): RuntimeEntityConfig<C> {
      return Object.freeze({ ...config,
            impactDamageMultiplier: config.impactDamageMultiplier ?? 1,
            hitboxOffset: { ...(config.hitboxOffset ?? { x: 0, y: 0 }) },
            defaultFacing: config.defaultFacing ?? "right",
            image: config.image ?? null,
            imageScale: config.imageScale ?? 1,
            imageOffset: { ...(config.imageOffset ?? { x: 0, y: 0 }) },
            imageCrop: config.imageCrop ?? null,
            healthBarOffset: { ...(config.healthBarOffset ?? { x: 0, y: 0 }) },
            color: config.color ?? "#ffffff",
            poses: config.poses ?? null,
      });
}
