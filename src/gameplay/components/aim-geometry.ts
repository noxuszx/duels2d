import type { AimSkillOptions, Facing, Vector2 } from "../../types/fighter";
import { childTransform, inversePoint, transformDirection, transformPoint, type VisualTransform } from "../../presentation/transform";

export interface AimFrame {
      root: VisualTransform;
      /** Root-local sprite or weapon offset, including facing for weapons. */
      offset: Vector2;
      facing: Facing;
      defaultFacing: Facing;
}

export interface AimSolution {
      origin: Vector2;
      direction: Vector2;
      /** Child rotation relative to the visual root, after local mirroring. */
      angle: number;
      pivot: Vector2;
      localPivot: Vector2;
      flip: boolean;
}

/** Optional reusable skill for rotating a sprite and aiming from its muzzle. */
export class AimGeometry {
      private solution: AimSolution | null = null;

      get current(): AimSolution | null { return this.solution; }
      get isActive(): boolean { return this.solution !== null; }

      update(frame: AimFrame, target: Vector2 | null, options: AimSkillOptions): void {
            if (!target) { this.stop(); return; }
            const flip = frame.facing !== frame.defaultFacing;
            const mirror = flip ? -1 : 1;
            const localPivot = options.pivot ?? { x: 0, y: 0 };
            const pivot = {
                  x: frame.offset.x + mirror * localPivot.x,
                  y: frame.offset.y + localPivot.y,
            };
            const offset = {
                  x: mirror * (options.muzzle.x - localPivot.x),
                  y: options.muzzle.y - localPivot.y,
            };
            const forward = (options.forwardDegrees ??
                  (frame.defaultFacing === "left" ? 180 : 0)) * Math.PI / 180;
            const localDirection = { x: mirror * Math.cos(forward), y: Math.sin(forward) };
            const localTarget = inversePoint(frame.root, target);
            const dx = localTarget.x - pivot.x;
            const dy = localTarget.y - pivot.y;
            const distance = Math.hypot(dx, dy);
            // Account for a muzzle displaced sideways from the pivot. A center-to-target
            // angle alone would make the barrel's ray miss the target.
            const lateral = localDirection.x * offset.y - localDirection.y * offset.x;
            const forwardOffset = localDirection.x * offset.x + localDirection.y * offset.y;
            if (distance <= Math.abs(lateral) + 1e-8 ||
                  Math.sqrt(Math.max(0, distance * distance - lateral * lateral)) <= forwardOffset) {
                  this.stop();
                  return;
            }
            const angle = Math.atan2(dy, dx) - Math.asin(lateral / distance) -
                  Math.atan2(localDirection.y, localDirection.x);
            const transform = childTransform(frame.root, frame.offset, mirror, { angle, pivot: localPivot });
            this.solution = {
                  origin: transformPoint(transform, options.muzzle),
                  direction: transformDirection(transform, { x: Math.cos(forward), y: Math.sin(forward) }),
                  angle, pivot: transformPoint(frame.root, pivot), localPivot: { ...localPivot }, flip,
            };
      }

      stop(): void { this.solution = null; }
}
