import type { AimSkillOptions, Facing, Vector2 } from "../../types/fighter";

export interface AimFrame {
      /** World location of the sprite center, including its pose offset. */
      center: Vector2;
      facing: Facing;
      defaultFacing: Facing;
}

export interface AimSolution {
      origin: Vector2;
      direction: Vector2;
      /** Absolute sprite rotation, applied after mirroring its local coordinates. */
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
                  x: frame.center.x + mirror * localPivot.x,
                  y: frame.center.y + localPivot.y,
            };
            const offset = {
                  x: mirror * (options.muzzle.x - localPivot.x),
                  y: options.muzzle.y - localPivot.y,
            };
            const forward = (options.forwardDegrees ??
                  (frame.defaultFacing === "left" ? 180 : 0)) * Math.PI / 180;
            const localDirection = { x: mirror * Math.cos(forward), y: Math.sin(forward) };
            const dx = target.x - pivot.x;
            const dy = target.y - pivot.y;
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
            const cos = Math.cos(angle), sin = Math.sin(angle);
            this.solution = {
                  origin: {
                        x: pivot.x + cos * offset.x - sin * offset.y,
                        y: pivot.y + sin * offset.x + cos * offset.y
                  },
                  direction: {
                        x: cos * localDirection.x - sin * localDirection.y,
                        y: sin * localDirection.x + cos * localDirection.y
                  },
                  angle, pivot, localPivot: { ...localPivot }, flip,
            };
      }

      stop(): void { this.solution = null; }
}
