import type { ArenaBounds, ArenaWall, Vector2 } from "../contracts";

export interface WallProfile {
      readonly isVertical: boolean;
      /** Sprite orientation angle when flush against this wall. */
      readonly surfaceAngle: number;
      /** Target offset along the wall's crawl axis (target minus self). */
      getCrawlDelta(target: Readonly<Vector2>, self: Readonly<Vector2>): number;
      /** Crawl coordinate along the wall axis. */
      getCrawlCoordinate(position: Readonly<Vector2>): number;
      /** Extract the velocity component along the crawl axis. */
      getVelocityComponent(velocity: Readonly<Vector2>): number;
      /** Active span along the wall within arena bounds, considering actor extents. */
      getCrawlSpan(arena: Readonly<ArenaBounds>, extent: Readonly<Vector2>): { min: number; max: number };
      /** Clamp body position to stay glued to this wall and within arena extents. */
      clampPosition(arena: Readonly<ArenaBounds>, extent: Readonly<Vector2>, position: Readonly<Vector2>): Vector2;
      /** Convert scalar speed and crawl direction (-1 | 1) into a velocity vector. */
      toVelocity(speed: number, direction: -1 | 1): Vector2;
      /** Determine if facing direction should be inverted relative to default facing. */
      shouldFlipFacing(direction: -1 | 1): boolean;
}

export const WALL_PROFILES: Readonly<Record<ArenaWall, WallProfile>> = {
      top: {
            isVertical: false,
            surfaceAngle: Math.PI,
            getCrawlDelta: (target, self) => target.x - self.x,
            getCrawlCoordinate: pos => pos.x,
            getVelocityComponent: vel => vel.x,
            getCrawlSpan: (arena, ext) => ({ min: arena.minX + ext.x, max: arena.maxX - ext.x }),
            clampPosition: (arena, ext, pos) => ({
                  x: Math.max(arena.minX + ext.x, Math.min(arena.maxX - ext.x, pos.x)),
                  y: arena.minY + ext.y,
            }),
            toVelocity: (speed, dir) => ({ x: dir * speed, y: 0 }),
            shouldFlipFacing: dir => dir > 0,
      },
      bottom: {
            isVertical: false,
            surfaceAngle: 0,
            getCrawlDelta: (target, self) => target.x - self.x,
            getCrawlCoordinate: pos => pos.x,
            getVelocityComponent: vel => vel.x,
            getCrawlSpan: (arena, ext) => ({ min: arena.minX + ext.x, max: arena.maxX - ext.x }),
            clampPosition: (arena, ext, pos) => ({
                  x: Math.max(arena.minX + ext.x, Math.min(arena.maxX - ext.x, pos.x)),
                  y: arena.maxY - ext.y,
            }),
            toVelocity: (speed, dir) => ({ x: dir * speed, y: 0 }),
            shouldFlipFacing: dir => dir < 0,
      },
      left: {
            isVertical: true,
            surfaceAngle: Math.PI / 2,
            getCrawlDelta: (target, self) => target.y - self.y,
            getCrawlCoordinate: pos => pos.y,
            getVelocityComponent: vel => vel.y,
            getCrawlSpan: (arena, ext) => ({ min: arena.minY + ext.y, max: arena.maxY - ext.y }),
            clampPosition: (arena, ext, pos) => ({
                  x: arena.minX + ext.x,
                  y: Math.max(arena.minY + ext.y, Math.min(arena.maxY - ext.y, pos.y)),
            }),
            toVelocity: (speed, dir) => ({ x: 0, y: dir * speed }),
            shouldFlipFacing: dir => dir < 0,
      },
      right: {
            isVertical: true,
            surfaceAngle: -Math.PI / 2,
            getCrawlDelta: (target, self) => target.y - self.y,
            getCrawlCoordinate: pos => pos.y,
            getVelocityComponent: vel => vel.y,
            getCrawlSpan: (arena, ext) => ({ min: arena.minY + ext.y, max: arena.maxY - ext.y }),
            clampPosition: (arena, ext, pos) => ({
                  x: arena.maxX - ext.x,
                  y: Math.max(arena.minY + ext.y, Math.min(arena.maxY - ext.y, pos.y)),
            }),
            toVelocity: (speed, dir) => ({ x: 0, y: dir * speed }),
            shouldFlipFacing: dir => dir > 0,
      },
};
