# Spatial queries and overlap tracking

## Spatial queries

`simulation.spatial` detects registered entities without creating physics bodies
or applying effects. `castSegment(from, to, { width })` returns hits ordered by
their first intersection distance along the segment. Width is the full thickness,
with flat ends; zero means a thin line. Segments must have positive length.
`overlapSegment(shape)` accepts the same geometry as a reusable shape description.
`overlapArea(shape)` accepts a circle or rotated rectangle and returns entities
ordered by runtime ID.

Queries use actual Matter body vertices and compound parts, including rotation;
circle bodies retain Matter's polygon approximation. Boundary contact counts.
Collision masks and sensor flags do not restrict detection. Dead entities are
excluded unless `includeDead` is set, and removed entities are always excluded.
The caller supplies exclusions and predicates for teams, tags, or ownership:

```ts
const hits = simulation.spatial.castSegment(from, to, {
      width: 8,
      exclude: [owner],
      filter: entity => entity.teamId !== owner.teamId && entity.tags.has("targetable"),
});
```

The caller decides whether to use the first hit, pierce multiple targets, or
apply another effect. `OverlapTracker.update(entities)` reports `entered`,
`staying`, and `exited` entities by object identity. The caller owns sampling,
effect timing, and cleanup; `clear()` silently discards history and `update([])`
reports exits. There are no automatic beam effects or tracking timers.

Related: [content helpers](../scripting/content-helpers.md), [simulation lifecycle](simulation-lifecycle.md).
