import type { ComponentContext } from "../../../engine/component";
import type { Vector2 } from "../../../engine/contracts";
import type { SpatialShape, SegmentShape } from "../../../engine/spatial/shapes";
import type { HitEffects, HitOptions } from "../../../gameplay/combat/effects";

/** Build the same world-space ray for querying and displaying a shot. */
export function raySegment(origin: Readonly<Vector2>, direction: Readonly<Vector2>,
      range: number, width: number): SegmentShape {
      return { type: "segment", from: origin, width,
            to: { x: origin.x + direction.x * range, y: origin.y + direction.y * range } };
}

/** Resolve one query now; timing, repeated pulses, and visuals belong to the caller. */
export function hitEnemies({ entity, simulation }: ComponentContext,
      shape: SpatialShape, effects: HitEffects, options?: HitOptions): void {
      const query = { filter: (other: typeof entity) =>
            other.teamId !== entity.teamId && other.tags.has("targetable") };
      const targets = shape.type === "segment"
            ? simulation.spatial.overlapSegment(shape, query).map(hit => hit.entity)
            : simulation.spatial.overlapArea(shape, query);
      for (const target of targets) simulation.hit(entity, target, effects, options);
}
