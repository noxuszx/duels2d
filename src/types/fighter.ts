import type { FighterComponents, MoveConfig } from "../config/component-settings";
export type { FighterComponents, MoveConfig } from "../config/component-settings";

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

export interface PoseOverrides {
      image: string;
      imageCrop?: ImageCrop | null;
      imageScale?: number;
      imageOffset?: Vector2;
      aim?: AimSkillOptions;
}
export type PoseConfig = string | PoseOverrides;
export type FighterPoses = Record<string, PoseConfig> | null;

/** Form settings are data; a behavior decides when and how to apply them. */
export interface FighterForm {
      components: FighterComponents;
      moves: Record<string, MoveConfig>;
      poses: FighterPoses;
      healthRatio?: number;
      sequence?: Array<{ pose: string; durationMs: number }>;
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
      /** Summon definitions remain editable in Studio but can be hidden from match selection. */
      selectable?: boolean;
      components?: FighterComponents;
      moves?: Record<string, MoveConfig>;
      forms?: Record<string, Partial<FighterForm>>;
      combat?: FighterCombatOverrides;
      body?: FighterBodyOverrides;
      presentation?: FighterPresentationOverrides;
      lines?: FighterLines;
}

export interface FighterDefaults {
      components: FighterComponents;
      moves: Record<string, MoveConfig>;
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
      selectable?: boolean;
      components: FighterComponents;
      moves: Record<string, MoveConfig>;
      maxHealth: number;
      speed: number;
      baseDamage: number;
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
      forms: Record<string, FighterForm>;
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
