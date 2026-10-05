import type { Vector2 } from "../contracts";

/** World-space shapes shared by detection and its eventual visual presentation. */
export interface SegmentShape {
      type: "segment";
      from: Readonly<Vector2>;
      to: Readonly<Vector2>;
      /** Full width, with flat ends at from/to. Zero means a thin line. */
      width: number;
}
export interface RectangleShape {
      type: "rectangle";
      center: Readonly<Vector2>;
      width: number;
      height: number;
      /** Radians around center. */
      angle?: number;
}
export interface CircleShape {
      type: "circle";
      center: Readonly<Vector2>;
      radius: number;
}
export type AreaShape = RectangleShape | CircleShape;
export type SpatialShape = SegmentShape | AreaShape;
