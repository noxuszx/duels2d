# Add a fighter

Start with [engine boundaries](../architecture/engine-boundaries.md). Definitions equip capabilities;
behavior scripts choose targets and sequences; JSON supplies tuning.

## Add a fighter

1. Create `config/fighters/<id>.json`, matching the filename to its unique ID.
   Add the file to `config/fighters/index.json` and assets under `assets/fighters/<id>/`.
2. Author stats, body/art, component settings, and named moves using the shared
   schema. Common values come from `defaults.json`.
3. Add `src/content/fighters/<id>/behavior.ts`, declaring the component-handle
   types it needs and returning generator handlers.
4. Add `definition.ts` with `defineFighter`: construct fresh components per owner,
   supply the behavior, and map every handler to a configured move ID.
5. Register the ready blueprint in `src/content/manifest.ts`. An entry without
   a blueprint uses the common preset as a passive opponent.

The definition equips capabilities; the behavior decides when to use them.
JSON alone does not attach components or execute moves. Runtime admission reads
`cooldownMs`; windup, recovery, range, and sound settings require explicit use
by a behavior/component. See [configuration](../../config/README.md) for data details.

Baby Man's handler expresses the sequence directly:

```ts
*onWallContact({ wall }) {
  const target = targeting.nearestEnemy();
  if (!target) return;

  yield wallCrawl.start(wall, { toward: target });

  const nextTarget = targeting.nearestEnemy();
  if (nextTarget) yield dash.start(nextTarget);
}
```

The runtime owns admission/cooldown/cancellation. Components own movement, poses,
hits, and resource cleanup. Reselecting after crawl is the character's decision.

For several independent moves, return an `actions` map keyed by configured move
ID. Each entry supplies a `when` predicate and generator `run`; no event binding
is needed in `tasks` for these entries:

```ts
actions: {
  shoot: {
    when: () => !!targeting.nearestEnemy(),
    *run() {
      const target = targeting.nearestEnemy();
      if (!target) return;
      yield* scoped(() => aim.track(target), function* () {
        const solution = aim.current;
        if (solution) yield gun.emit({ position: solution.origin, direction: solution.direction });
      });
    },
  },
}
```

The runtime checks declaration order and the active form's move map, admits one
ready action, and owns its cooldown. An entry with `interrupt: true` may replace
another task when its condition and admission checks pass; it cannot interrupt
itself. Granny uses this for transformation. A cancelled sequence stops; it is
not resumed automatically. Granny's still-true threshold permits a fresh attempt
after a status restriction ends, committing the form only after both timed poses.

Related: [behavior patterns](behavior-patterns.md), [projectile assembly example](projectile-authoring.md), [verification](verification.md).
