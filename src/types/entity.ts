import type { Facing, FighterPoses, Hitbox, ImageCrop, Vector2 } from "./fighter";

/** Baseline physical and visual configuration for any entity in the simulation. */
export interface EntityConfig {
      id: string;
      radius: number;
      hitbox: Hitbox;
      hitboxOffset?: Vector2;
      speed: number;
      maxHealth: number;
      defaultFacing?: Facing;
      image?: string | null;
      imageScale?: number;
      imageOffset?: Vector2;
      imageCrop?: ImageCrop | null;
      healthBarOffset?: Vector2;
      color?: string;
      poses?: FighterPoses;
}
