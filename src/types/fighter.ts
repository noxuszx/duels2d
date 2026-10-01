import type { AbilityConfig } from "../abilities/types";

export interface Vector2 {
      x: number;
      y: number;
}
export interface ImageCrop {
      x: number;
      y: number;
      width: number;
      height: number;
}
export type Facing = "left" | "right";
export type FaceTargetMode = "never" | "always" | "range";
export interface FaceTargetConfig {
      mode: FaceTargetMode;
}
export interface BoxHitbox {
      type: "box";
      width: number;
      height: number;
}
export interface CircleHitbox {
      type: "circle";
      radius: number;
}
export type Hitbox = BoxHitbox | CircleHitbox;
/** Coordinates in the unflipped sprite's local drawing space, in game pixels. */
export interface AimSkillOptions {
      muzzle: Vector2;
      pivot?: Vector2;
      /** Barrel direction in the authored sprite, degrees clockwise from right. */
      forwardDegrees?: number;
}

export interface FighterSkills {
      aim?: AimSkillOptions;
}

export interface PoseOverrides {
      image: string;
      imageCrop?: ImageCrop | null;
      imageScale?: number;
      imageOffset?: Vector2;
      aim?: AimSkillOptions;
}
export type PoseConfig = string | PoseOverrides;
export type FighterPoses = Record<string, PoseConfig> | null;

export interface HealthThresholdTransformationTrigger {
      type: "health-threshold";
      /** Transform when current health divided by max health reaches this ratio. */
      healthRatio: number;
}

export type TransformationTrigger = HealthThresholdTransformationTrigger;

export interface TransformationSequenceStep {
      pose: string;
      durationMs: number;
}

/** Optional overrides authored in a fighter JSON file. */
export interface FighterTransformationDefinition {
      trigger: TransformationTrigger;
      /** Overrides base skills after the sequence finishes; an empty object disables them. */
      skills?: FighterSkills;
      sequence?: TransformationSequenceStep[];
      combat?: {
            abilities?: AbilityConfig[];
      };
      presentation?: {
            poses?: FighterPoses;
      };
}

/** Fully-composed transformation data used by the runtime. */
export interface FighterTransformationConfig {
      trigger: TransformationTrigger;
      skills?: FighterSkills;
      sequence?: TransformationSequenceStep[];
      abilities: AbilityConfig[];
      poses: FighterPoses;
}

/** Values accepted by the fighter JSON schema's `lines` object. */
export interface FighterLines {
      ambientIntervalMs?: number;
      ambientChance?: number;
      [group: string]: number | string[] | undefined;
}

export interface FighterCombatOverrides {
      maxHealth?: number;
      speed?: number;
      baseDamage?: number;
      abilities?: AbilityConfig[];
      faceTarget?: FaceTargetConfig;
}
export interface FighterBodyOverrides {
      radius?: number;
      hitbox?: Hitbox;
      hitboxOffset?: Vector2;
}
export interface FighterPresentationOverrides {
      image?: string | null;
      imageScale?: number;
      imageOffset?: Vector2;
      imageCrop?: ImageCrop | null;
      healthBarOffset?: Vector2;
      weaponScale?: number;
      weaponOffset?: Vector2;
      weaponPivot?: Vector2;
      weaponIdle?: string | null;
      weaponAttack?: string | null;
      poses?: FighterPoses;
      defaultFacing?: Facing;
}

/** Editable JSON representation. Nested configuration is intentionally optional. */
export interface FighterDefinition {
      $schema?: string;
      id: string;
      name: string;
      color: string;
      skills?: FighterSkills;
      combat?: FighterCombatOverrides;
      body?: FighterBodyOverrides;
      presentation?: FighterPresentationOverrides;
      transformation?: FighterTransformationDefinition;
      lines?: FighterLines;
}

export interface FighterDefaults {
      combat: Required<FighterCombatOverrides>;
      body: Required<FighterBodyOverrides>;
      presentation: Required<FighterPresentationOverrides>;
      lines: FighterLines;
}

/** Fully-composed runtime representation consumed by fighters and game systems. */
export interface FighterConfig {
      id: string;
      name: string;
      color: string;
      skills?: FighterSkills;
      maxHealth: number;
      speed: number;
      baseDamage: number;
      abilities: AbilityConfig[];
      faceTarget: FaceTargetConfig;
      radius: number;
      hitbox: Hitbox;
      hitboxOffset: Vector2;
      image: string | null;
      imageScale: number;
      imageOffset: Vector2;
      imageCrop: ImageCrop | null;
      healthBarOffset: Vector2;
      weaponScale: number;
      weaponOffset: Vector2;
      weaponPivot: Vector2;
      weaponIdle?: string | null;
      weaponAttack?: string | null;
      poses: FighterPoses;
      transformation: FighterTransformationConfig | null;
      defaultFacing: Facing;
      lines: FighterLines;
}

export interface FighterManifest {
      fighters: string[];
}
export interface FighterConfigLoadResult {
      defaults: FighterDefaults;
      definitions: FighterDefinition[];
      roster: FighterConfig[];
}
