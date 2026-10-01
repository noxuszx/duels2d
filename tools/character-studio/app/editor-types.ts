import type {
      Facing,
      FighterConfig,
      Hitbox,
      ImageCrop,
      PoseConfig,
      Vector2,
} from "../../../src/types/fighter";

export type Rect = { x: number; y: number; width: number; height: number };
export type NumericInput = Omit<HTMLInputElement, "value"> & {
      value: string | number;
};
export type PoseVisual = {
      imageScale: number;
      imageOffset: Vector2;
      imageCrop: ImageCrop | null;
};
export type PosePatch = Partial<PoseVisual>;
export type ControlName =
      | "hitboxWidth"
      | "hitboxHeight"
      | "hitboxRadius"
      | "hitboxOffsetX"
      | "hitboxOffsetY"
      | "attackHitboxWidth"
      | "attackHitboxHeight"
      | "attackHitboxOffsetX"
      | "attackHitboxOffsetY"
      | "imageScale"
      | "imageOffsetX"
      | "imageOffsetY"
      | "healthBarOffsetX"
      | "healthBarOffsetY"
      | "weaponScale"
      | "weaponOffsetX"
      | "weaponOffsetY"
      | "weaponPivotX"
      | "weaponPivotY"
      | "swingStartDegrees"
      | "swingEndDegrees"
      | "imageCropX"
      | "imageCropY"
      | "imageCropWidth"
      | "imageCropHeight";
export type EditableHitbox = Hitbox;
export type StudioConfig = Omit<FighterConfig, "hitbox" | "poses"> & {
      hitbox: Hitbox;
      poses: Record<string, PoseConfig> | null;
};
export type StudioState = Pick<
      StudioConfig,
      | "hitbox"
      | "hitboxOffset"
      | "defaultFacing"
      | "image"
      | "imageScale"
      | "imageOffset"
      | "imageCrop"
      | "healthBarOffset"
      | "weaponScale"
      | "weaponOffset"
      | "weaponPivot"
      | "weaponIdle"
      | "skills"
      | "abilities"
      | "transformation"
      | "poses"
> & { activePoseKey: string; activeForm: "base" | "transformed" };
export type JSONValue =
      | string
      | number
      | boolean
      | null
      | JSONValue[]
      | { [key: string]: JSONValue };
export type DragState = {
      handle: string;
      startX: number;
      startY: number;
      startRect: Rect;
      imageRect: Rect;
      startOffset: Vector2;
};
export type StudioFileHandle = {
      createWritable(): Promise<{
            write(content: string): Promise<void>;
            close(): Promise<void>;
            abort?(reason?: unknown): Promise<void>;
      }>;
};
export type StudioTextStyle = {
      fillColor: string;
      strokeColor: string;
      strokeWidth: number;
      weight: string;
      family: string;
      align: CanvasTextAlign;
      baseline: CanvasTextBaseline;
};
export type StudioFacing = Facing;
