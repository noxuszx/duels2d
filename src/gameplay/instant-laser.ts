import type { Fighter } from "../entities/fighter";
import type { Vector2 } from "../types/fighter";

/** Instant piercing attack. Its flash is presentation only, never an active hazard. */
export interface LaserShot {
      origin: Vector2;
      direction: Vector2;
      length: number;
      width: number;
      damage: number;
      color: string;
      flashMs: number;
}

export interface LaserTargetGeometry {
      vertices: Vector2[];
      center: Vector2;
      radius: number;
}

export function captureLaserTarget(target: Fighter): LaserTargetGeometry[] {
      const parts = target.body.parts.length > 1 ? target.body.parts.slice(1) : [target.body];
      return parts.map(part => ({ center: { ...part.position }, radius: part.circleRadius || 0,
            vertices: part.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) }));
}

function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function cross(a: Vector2, b: Vector2, c: Vector2): number {
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentDistance(a: Vector2, b: Vector2, c: Vector2, d: Vector2): number {
      const abC = cross(a, b, c), abD = cross(a, b, d);
      const cdA = cross(c, d, a), cdB = cross(c, d, b);
      if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
            ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0;
      return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d),
            distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

function insideConvex(point: Vector2, vertices: readonly Vector2[]): boolean {
      let positive = false, negative = false;
      for (let i = 0; i < vertices.length; i++) {
            const value = cross(vertices[i], vertices[(i + 1) % vertices.length], point);
            if (value > 1e-8) positive = true;
            if (value < -1e-8) negative = true;
            if (positive && negative) return false;
      }
      return vertices.length >= 3;
}

function convexHull(points: Vector2[]): Vector2[] {
      const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
      const half = (values: Vector2[]) => {
            const hull: Vector2[] = [];
            for (const point of values) {
                  while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
                  hull.push(point);
            }
            return hull;
      };
      return [...half(ordered).slice(0, -1), ...half([...ordered].reverse()).slice(0, -1)];
}

/** Continuous relative-translation query for a moving sustained beam. Rotation uses a conservative hull. */
export function laserSweptTouchesFighter(shot: LaserShot, previousOrigin: Vector2,
      target: Fighter, previous: LaserTargetGeometry[]): boolean {
      if (laserTouchesFighter(shot, target)) return true;
      const magnitude = Math.hypot(shot.direction.x, shot.direction.y);
      if (!magnitude) return false;
      const a = shot.origin;
      const b = { x: a.x + shot.direction.x / magnitude * shot.length,
            y: a.y + shot.direction.y / magnitude * shot.length };
      const shift = { x: a.x - previousOrigin.x, y: a.y - previousOrigin.y };
      return captureLaserTarget(target).some((part, index) => {
            const old = previous[index];
            if (!old) return false;
            if (part.radius && old.radius) return segmentDistance(a, b,
                  { x: old.center.x + shift.x, y: old.center.y + shift.y }, part.center) <=
                        shot.width / 2 + Math.max(part.radius, old.radius);
            const hull = convexHull([...part.vertices,
                  ...old.vertices.map(point => ({ x: point.x + shift.x, y: point.y + shift.y }))]);
            return insideConvex(a, hull) || insideConvex(b, hull) || hull.some((point, i) =>
                  segmentDistance(a, b, point, hull[(i + 1) % hull.length]) <= shot.width / 2 + 1e-8);
      });
}

/** Thick finite ray against actual world-space physics geometry; no body mutation. */
export function laserTouchesFighter(shot: LaserShot, target: Fighter): boolean {
      if (target.isDead || !Number.isFinite(shot.length) || shot.length <= 0 ||
            !Number.isFinite(shot.width) || shot.width < 0 ||
            ![shot.origin.x, shot.origin.y, shot.direction.x, shot.direction.y].every(Number.isFinite)) return false;
      const magnitude = Math.hypot(shot.direction.x, shot.direction.y);
      if (magnitude <= 1e-8) return false;
      const a = shot.origin;
      const b = { x: a.x + shot.direction.x / magnitude * shot.length,
            y: a.y + shot.direction.y / magnitude * shot.length };
      const radius = shot.width / 2;
      const parts = target.body.parts.length > 1 ? target.body.parts.slice(1) : [target.body];
      return parts.some(part => {
            if (part.circleRadius) return distanceToSegment(part.position, a, b) <= radius + part.circleRadius;
            const vertices = part.vertices;
            if (insideConvex(a, vertices) || insideConvex(b, vertices)) return true;
            return vertices.some((vertex, index) =>
                  segmentDistance(a, b, vertex, vertices[(index + 1) % vertices.length]) <= radius + 1e-8);
      });
}
