# Reusable component and operation authoring

## Implement a reusable component or action

Read [engine boundaries](../architecture/engine-boundaries.md#permission-boundary) first:
new core components and engine changes require explicit user permission.

Before creating a component, check whether a behavior script or content helper
can compose the existing primitives. Do not retain old APIs through adapters or
duplicate code paths during a primitives refactor; migrate their callers.
Use content helpers for movement sequences: `steer` commands velocity on
dynamic bodies, while `moveTo` moves static actors along a timed linear path.
Use `all` and `race` to compose concurrent operations within one behavior task.
Projectile groups and content-level `burst` handle multi-emission attacks.
Use `onProjectileEvents(projectile, { onImpact, onWall, onEnd })` for projectile
responses. Choose gameplay end reasons explicitly; reset and owner/match cleanup
must not accidentally produce attack effects. Depressed Man's cluster tear is
the working example, with one burst from `onEnd` and no custom contact component.
To run a multi-step generator alongside another effect, compose it with
`sequence(factory)`:

```ts
yield all(sequence(patrol), sequence(function* () {
  yield race(until(() => deploying), sequence(beams));
  yield* deployAllies();
}));
```

The saucer's [behavior](../../src/content/actors/saucer/behavior.ts) is the working
example: movement and beam/deployment scripts share one foreground task and
use the same runner as other fighters. Named generator functions keep its
phases readable. `until` observes script state without browser timers or a
custom tick hook. Granny and Alien Man share configured `poseSequence` steps;
their threshold and form-entry decisions remain in their own behaviors.

For an independently running trap, turret, or summon, use `spawnActor` from
`src/gameplay/actor-factory.ts`. Supply a body, entity config, and generator
receiving the actor's context. Actors inherit team and ownership, default to
empty tags, and are removed on completion or owner/match retirement. Override
`removeOnComplete` and `lifetime` when persistence is intentional. The saucer's
definition uses this same API; larger actors can keep dedicated content folders.
See [scripted actors](../scripting/scripted-actors.md)
for lifecycle details. Fighter, projectile, and actor factories all delegate
construction and registration to `createEntity` in the engine.

Place mechanics under `src/gameplay/components/`. Implement the needed
`EntityComponent` hooks, accepting owner-bound `ComponentContext` and typed
settings. Import generic context from `src/engine/component.ts`; mechanics can
operate on nonfighters and read normalized data through `context.entity.config`.
Use the factory's `FighterContext` only when accessing fighter moves/forms or
other fighter metadata. Expose focused methods for behaviors; leave choreography in the script.
A component may run independent background work in its tick hooks.

For a per-use action:

- Construct an inert `ScriptOperation`; acquire resources in `start(scope)`.
- Reject invalid targets/settings or unavailable exclusive resources before
  applying effects. Report `resource-conflict` when appropriate.
- Return exact consumed simulation time from `advance`, with explicit completion
  and timeout rules. Keep hit/contact history per use.
- Add temporary lease/subscription releases to the scope. Cancellation stops
  work without continuing the sequence; cleanup is idempotent.

Inspect [wall crawl](../../src/gameplay/components/locomotion/wall-crawl.ts),
[dash](../../src/gameplay/components/locomotion/dash.ts),
[operation](../../src/engine/scripting/operation.ts), and
[scope](../../src/engine/scripting/scope.ts) before implementing a mechanic.
Route hit effects through shared combat and pose/rotation through presentation
leases. Keep low-level Matter manipulation in focused mechanics, physics code,
or content helpers so behavior scripts remain readable sequences.

For editable component settings, update `FighterComponents` in
`src/config/component-settings.ts` and the matching JSON Schema together.
The shared validator supports the schema vocabulary currently used; a new
unsupported keyword requires a validator change too. Studio's Components JSON
field handles schema-approved settings; add dedicated controls when useful.
New [statuses](../architecture/status-effects-architecture.md) register their effect module and
use the existing combat/controller boundary.

Related: [operation results](../scripting/script-results.md), [resources](../scripting/script-resources.md), [verification](verification.md).
