import type { Vector2 } from "../engine/contracts";
import type { VisualOrientation } from "./state";

/** Canvas-compatible affine transform shared by drawing and muzzle geometry. */
export interface VisualTransform { a: number; b: number; c: number; d: number; e: number; f: number; }

export function rootTransform(center: Vector2, angle: number): VisualTransform {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return { a: cos, b: sin, c: -sin, d: cos, e: center.x, f: center.y };
}

export function transformPoint(transform: VisualTransform, point: Vector2): Vector2 {
      const direction = transformDirection(transform, point);
      return { x: direction.x + transform.e, y: direction.y + transform.f };
}

export function transformDirection(transform: VisualTransform, direction: Vector2): Vector2 {
      return { x: transform.a * direction.x + transform.c * direction.y,
            y: transform.b * direction.x + transform.d * direction.y };
}

export function inversePoint(transform: VisualTransform, point: Vector2): Vector2 {
      const x = point.x - transform.e, y = point.y - transform.f;
      const determinant = transform.a * transform.d - transform.b * transform.c;
      return { x: (transform.d * x - transform.c * y) / determinant,
            y: (-transform.b * x + transform.a * y) / determinant };
}

/** Child offset and pivot are root-local; mirroring precedes child rotation. */
export function childTransform(root: VisualTransform, offset: Vector2, mirror: number,
      orientation: VisualOrientation): VisualTransform {
      const pivot = orientation.pivot ?? { x: 0, y: 0 };
      const cos = Math.cos(orientation.angle), sin = Math.sin(orientation.angle);
      const a = cos * mirror, b = sin * mirror, c = -sin, d = cos;
      const e = offset.x + mirror * pivot.x - a * pivot.x - c * pivot.y;
      const f = offset.y + pivot.y - b * pivot.x - d * pivot.y;
      return {
            a: root.a * a + root.c * b, b: root.b * a + root.d * b,
            c: root.a * c + root.c * d, d: root.b * c + root.d * d,
            e: root.a * e + root.c * f + root.e, f: root.b * e + root.d * f + root.f,
      };
}
