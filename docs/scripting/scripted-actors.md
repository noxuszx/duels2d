# Entity assembly and scripted actors

### Entity assembly and scripted actors

`createEntity(simulation, entityOptions, { install, lifetime })` in
`src/engine/entity-factory.ts` is the common assembly path for fighters,
projectiles, and actors. It constructs an entity, supplies a typed context with
a live `config` getter, installs its capabilities, and registers it through the
simulation. Installation and registration failures retire the entity and preserve
the original error. Callers author the Matter body; assembly adds no physics preset.

`spawnActor(ownerContext, options, script)` in `src/gameplay/actor-factory.ts`
adds an independent lifecycle generator using the existing behavior runtime.
Its script receives the actor's context, not the spawning fighter's context.

```ts
const mine = spawnActor(context, {
  config: mineConfig,
  body: mineBody,
}, function* (actor) {
  yield wait(1000);
  hitEnemies(actor, explosionShape(actor.entity), { damage: 20 });
});
```

The runtime ID is generated from the spawning entity's ID and actor config ID.
Team and ownership inherit from the spawning entity; `teamId` and `ownerId`
override them, including `ownerId: null` for an unowned actor. Tags default to
`[]`, so actors do not participate in targeting or match victory unless opted in.
Arena containment defaults to true. `install(actor)` can equip capabilities before
behavior installation without creating another behavior runtime.

`lifetime` defaults to removal on owner death, owner removal, and match end.
Each policy can be overridden with `"persist"`. Match-end policies apply when
the simulation records its result; persistent actors can continue afterward.
Reset and disposal always retire actors.

Registration follows the existing mutation boundary. The script starts once on
its first simulation step, with no elapsed time charged at admission. Actors
spawned during a step begin on the next step. Each actor has its own foreground
task and uses the existing status restrictions, contact routing, and scoped
cleanup. Interruption does not restart its lifecycle script.

Normal generator completion removes the actor unless `removeOnComplete: false`.
Cancellation only closes the script and releases its resources; lifetime policies
determine removal. Unhandled generator or operation errors retire the actor and
propagate the original error. Completion effects belong after yielded work,
not in `finally` blocks, which also run during cancellation.

The saucer uses this API with `matchEnd: "persist"`; patrol, beams, deployment,
and summon decisions remain in its content behavior.

Related: [simulation lifecycle](../architecture/simulation-lifecycle.md), [composition](script-composition.md).
