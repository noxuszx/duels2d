import { Vertices, type Body } from "matter-js";
import type { Entity } from "../entity";
import type { EntityRegistry } from "../entity-registry";
import type { Vector2 } from "../contracts";
import type { AreaShape, RectangleShape, SegmentShape } from "./shapes";

export interface QueryOptions {
      includeDead?: boolean;
      exclude?: readonly Entity[];
      filter?: (entity: Entity) => boolean;
}
export interface SegmentHit {
      entity: Entity;
      distance: number;
}

const EPSILON = 1e-8;
const byId = (a: Entity, b: Entity): number => a.runtimeId < b.runtimeId ? -1 : a.runtimeId > b.runtimeId ? 1 : 0;



/** Read-only queries against registered bodies, independent of physics collision masks. */
export class SpatialQueries {
      constructor(private readonly registry: EntityRegistry) { }

      castSegment(from: Readonly<Vector2>, to: Readonly<Vector2>,
            options: QueryOptions & { width?: number } = {}): SegmentHit[] {
            return this.overlapSegment({ type: "segment", from, to, width: options.width ?? 0 }, options);
      }

      /** Shape overload lets rendering and detection consume the same description. */
      overlapSegment(shape: SegmentShape, options: QueryOptions = {}): SegmentHit[] {
            requirePoint(shape.from); requirePoint(shape.to);
            if (!Number.isFinite(shape.width) || shape.width < 0) throw new RangeError("Segment width must be nonnegative");
            const dx = shape.to.x - shape.from.x, dy = shape.to.y - shape.from.y;
            const length = Math.hypot(dx, dy);
            if (!Number.isFinite(length) || length <= 0) throw new RangeError("Segment must have a finite positive length");
            const axis = { x: dx / length, y: dy / length };
            const hits: SegmentHit[] = [];
            for (const entity of this.candidates(options)) {
                  let distance = Infinity;
                  for (const part of bodyParts(entity.body)) {
                        const polygon = part.vertices.map(vertex => {
                              const x = vertex.x - shape.from.x, y = vertex.y - shape.from.y;
                              return { x: x * axis.x + y * axis.y, y: -x * axis.y + y * axis.x };
                        });
                        const intersection = clipRectangle(polygon, 0, length, -shape.width / 2, shape.width / 2);
                        for (const point of intersection) distance = Math.min(distance, Math.max(0, point.x));
                  }
                  if (Number.isFinite(distance)) hits.push({ entity, distance });
            }
            return hits.sort((a, b) => a.distance - b.distance || byId(a.entity, b.entity));
      }

      overlapArea(shape: AreaShape, options: QueryOptions = {}): Entity[] {
            requirePoint(shape.center);
            if (shape.type === "circle") requirePositive(shape.radius, "Circle radius");
            else {
                  requirePositive(shape.width, "Rectangle width");
                  requirePositive(shape.height, "Rectangle height");
                  if (!Number.isFinite(shape.angle ?? 0)) throw new RangeError("Rectangle angle must be finite");
            }
            return this.candidates(options).filter(entity => bodyParts(entity.body).some(part =>
                  shape.type === "circle"
                        ? circleOverlaps(shape.center, shape.radius, part.vertices)
                        : rectangleOverlaps(shape, part.vertices))).sort(byId);
      }

      private candidates(options: QueryOptions): Entity[] {
            return this.registry.all().filter(entity =>
                  (options.includeDead || entity.isAlive) && !options.exclude?.includes(entity) &&
                  (!options.filter || options.filter(entity)));
      }
}

/** Compound parents contain a hull across empty space; only their real parts count. */
function bodyParts(body: Body): readonly Body[] {
      return body.parts.length > 1 ? body.parts.slice(1) : [body];
}

function requirePoint(point: Readonly<Vector2>): void {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("Query coordinates must be finite");
}
function requirePositive(value: number, name: string): void {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
}



/** Clip actual convex Matter parts against an oriented query's local rectangle. */
function clipRectangle(polygon: readonly Vector2[], minX: number, maxX: number,
      minY: number, maxY: number): Vector2[] {
      let result = [...polygon];
      for (const [axis, boundary, sign] of [
            ["x", minX, 1], ["x", maxX, -1], ["y", minY, 1], ["y", maxY, -1],
      ] as const) {
            const input = result;
            result = [];
            if (!input.length) break;
            let previous = input.at(-1)!;
            let previousDistance = sign * (previous[axis] - boundary);
            for (const point of input) {
                  const distance = sign * (point[axis] - boundary);
                  const inside = distance >= -EPSILON, previousInside = previousDistance >= -EPSILON;
                  if (inside !== previousInside) {
                        const fraction = previousDistance / (previousDistance - distance);
                        result.push({
                              x: previous.x + fraction * (point.x - previous.x),
                              y: previous.y + fraction * (point.y - previous.y)
                        });
                  }
                  if (inside) result.push(point);
                  previous = point;
                  previousDistance = distance;
            }
      }
      return result;
}



function rectangleOverlaps(shape: RectangleShape, vertices: readonly Vector2[]): boolean {
      const angle = shape.angle ?? 0, cos = Math.cos(angle), sin = Math.sin(angle);
      const local = vertices.map(vertex => {
            const x = vertex.x - shape.center.x, y = vertex.y - shape.center.y;
            return { x: x * cos + y * sin, y: -x * sin + y * cos };
      });
      return clipRectangle(local, -shape.width / 2, shape.width / 2, -shape.height / 2, shape.height / 2).length > 0;
}



function circleOverlaps(center: Readonly<Vector2>, radius: number, vertices: Vector2[]): boolean {
      if (Vertices.contains(vertices, center)) return true;
      const radiusSquared = radius * radius;
      for (let index = 0; index < vertices.length; index++) {
            const a = vertices[index], b = vertices[(index + 1) % vertices.length];
            const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
            const fraction = lengthSquared ? Math.max(0, Math.min(1,
                  ((center.x - a.x) * dx + (center.y - a.y) * dy) / lengthSquared)) : 0;
            const x = a.x + fraction * dx - center.x, y = a.y + fraction * dy - center.y;
            if (x * x + y * y <= radiusSquared + EPSILON) return true;
      }
      return false;
}
