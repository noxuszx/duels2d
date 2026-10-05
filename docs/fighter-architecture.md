# Fighter architecture

The simulation foundation is implemented. Gameplay runs in a headless, fixed
120 Hz simulation with explicit fighter definitions, reusable owner-bound
components, and one foreground behavior task per fighter. Baby Man and Granny
have active scripted behaviors; other roster entries use the shared passive
setup and remain available as opponents. Fighter JSON and Character
Studio now use `components`, `moves`, and named `forms` as editable data.

The browser application owns real-time frame accumulation, input/UI, assets,
audio, and Canvas rendering. It calls `Simulation.step()` and draws the resulting
presentation state. Browser APIs do not decide gameplay timing.

```text
fighter JSON ──> composed config ──> createFighter + optional blueprint
                                          │
                                          ├── owner-bound components
                                          └── behavior handlers
                                                  │
Simulation: seeded RNG, 120 Hz clock, Matter world, registry, contacts, combat
                                                  │
Browser app: frame accumulator ──> step ──> presentation view ──> Canvas/audio
```

## Ownership

| Part | Owns |
| --- | --- |
| `Simulation` | Fixed tick and simulation time, Matter world, entity registry, seeded gameplay RNG, contact collection/resolution, shared combat and match rules |
| `Entity` | Runtime identity, team, body, health, presentation state, statuses, component container, and behavior runtime attachment |
| Component | A persistent capability bound to one entity; its own settings, tick/contact hooks, and detach cleanup |
| Behavior | Character decisions, target selection, and ordering of yielded operations |
| `BehaviorRuntime` | One foreground generator task, move cooldowns, admission/rejection, simulation-time advancement, cancellation, and tracing |
| `ScriptOperation` and `ScriptScope` | One action use and its scoped resource leases/cleanup callbacks |
| Combat and status services | Shared hit/damage/knockback results and registered timed status effects |
| Browser app and presentation | Frame accumulation, rendering, asset and audio adapters, UI, and presentation output |
| JSON and Character Studio | Editable identity, balance, component/move settings, sprites/poses, named forms, serialization, and history |

An equipped component is created once and receives its owner during attachment.
It can create inert per-use operations; each operation acquires its own scoped
resources when it starts. Components do not secretly equip other capabilities.
`ResourceLeases` provides exclusive controls and contact-policy overrides.
Component detach and operation cancellation release owned work and are designed
to be idempotent. `acquireIgnoredContact(runtimeId)` leases suppress both native
Matter response and gameplay dispatch for that pair; components choose the
policy, and the physics adapter applies it before Matter resolves impulses.

## Behavior tasks and contacts

`BehaviorRuntime` admits one foreground task per entity. A move definition
supplies its id and cooldown. The runtime rejects busy, cooling-down,
status-blocked, invalid-target, inactive, and resource-conflict uses with a
reason. A no-op generator does not commit its cooldown. Operations consume
simulation time and pass unused time to the next yielded operation in the same
tick. Cancellation releases the active scope and does not advance to the next
operation. Gameplay scheduling uses simulation time, never browser timers.

Blueprint behavior handlers can respond to `onSpawn` (one admission attempt on
the first simulation step), `onUpdate` (while the foreground runtime is free), generic
`onContact` (wall or entity contact), or the convenience `onWallContact` hook.
When the specific wall hook exists it takes precedence over `onContact` for
wall events. Each declared handler must map to a configured move ID in the
blueprint; the move settings provide its cooldown. The runtime handles
admission and prevents starting a second foreground task while one is active.

Matter contacts are collected by the physics adapter and resolved by
`Simulation` after the Matter update. Wall contact decisions can update scoped
contact policy before the default bounce and impact response are applied.
Combat services resolve shared effects; presentation consumes state/events.
Structural entity registration and removal are handled by the entity registry
at its safe mutation boundary.

Statuses are modules implementing `StatusDefinition`, registered in
`src/gameplay/statuses/registry.ts`. They can declare capability restrictions,
stack/refresh policy, and simulation-time apply/tick/expire hooks. Existing
registered effects are stun, ability-lock, and burn.

The small JSON Schema validator in `src/config/schema-validator.js` is shared by
browser config loading, Character Studio validation, and the config CLI. It
validates the schema vocabulary used by fighter data without a separate schema
package. The CLI also checks cross-file references such as assets, sounds,
component poses, and summon IDs.

## Baby Man as an authoring example

`src/content/fighters/babyman/definition.ts` equips targeting, wall-crawl, and
dash components and binds the `onWallContact` move. The readable behavior in
`behavior.ts` selects an enemy, yields a crawl operation, selects again, then
yields a dash. Component classes own mechanics and cleanup; the behavior owns
only this order and target choice. Component tuning and move cooldown live in
`config/fighters/babyman.json` and remain editable in Character Studio.

The reusable projectile component is implemented at
`src/gameplay/components/projectile/`. Its emitter owns firing decisions and
feedback, its factory constructs and registers projectiles, and flight owns each
projectile's lifetime and contacts. Equip a `ProjectileEmitter`; behavior
code can yield `emitter.start(target)` as a one-use operation. On admission it
calls `spawn(target)`, registers an owner-bound projectile with the simulation,
and applies its configured flight/contact/ownership policy. Each projectile
tracks its own lifetime and hit history. Granny equips it with `SpriteAim` and
fires toward the current target inside an explicit `aim.follow()` interval.

## Authoring and data

`Entity<C>` uses common physical/visual configuration, with optional fields
normalized once at construction. `Entity<FighterConfig>` preserves fighter
metadata for typed assembly without adding a separate fighter class. Generic
mechanics use `ComponentContext` from `engine/component.ts`; fighter definitions
and forms use `FighterContext` from the factory. Targeting receives its facing
policy explicitly rather than assuming its owner is a fighter.

Configuration access is read-only. `setConfiguration()` normalizes replacement
settings and rejects changes to identity, hitbox/offset, radius, and maximum
health, since it does not rebuild physics or health state. Forms use that method;
equipped component handles still retain their explicitly supplied settings.

See [fighter authoring](fighter-authoring.md) for definition/behavior examples,
component contracts, and spawned entity ownership. The
[configuration guide](../config/README.md) describes editable data and validation;
the [Studio guide](../tools/character-studio/README.md) describes editor ownership.

JSON configures capabilities but does not equip them. Definitions attach fresh
components for each owner. Move `cooldownMs` is used by runtime admission; other
move fields such as windup/recovery/range/sound require explicit behavior or
component use. There is no automatic phase sequence.

Supplied form `components`, `moves`, and `poses` maps replace their respective
base maps; omitted maps inherit during composition. An empty map is explicit.
The `Forms` component selects named config data when behavior calls `enter()`;
it does not install or remove component handles. Definitions equip stable handles
once, and scripts decide which to use. Granny's behavior owns its health
threshold, interruption, timed realization/rage poses, and eventual form entry.
No threshold or sequence runs automatically from JSON.

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

## Simulation lifecycle and entity ownership

Each `step()` advances `1000 / 120` ms until the simulation is disposed. Live entities update
statuses, the active task, and component `beforeStep` hooks. Owner-death cleanup
and queued removals occur before Matter, so expired bodies cannot impart impulses.
The engine then updates physics, contains eligible bodies in the arena, resolves
wall contacts followed by captured body contacts, runs `afterStep`, and evaluates
match rules. Body contacts are sorted by runtime IDs. Remaining queued additions
and removals flush at the final mutation boundary.

Spawn through `simulation.add` and retire through `simulation.remove`. Removal
changes logical liveness immediately; additions made during a step become
registered at its final boundary. Components do not mutate the Matter world
or maintain private entity/collision registries. Allocate spawned IDs with
`simulation.nextRuntimeId(prefix)`. Owner-death and owner-removal policies
explicitly choose whether dependent entities persist or are removed. Announcing
the result does not invoke registry match-end cleanup; authored `onMatchEnd`
policies apply only if a caller explicitly requests `retireMatchEnd()` cleanup.

Ordinary fighters carry `targetable` and `contestant` tags. Projectile entities
have an owner and empty tags; targeting and victory rules do not count them as
fighters. Match rules count surviving teams of unowned contestants. Match end
records the first outcome and emits one announcement; physics, live behaviors,
statuses, spawning, projectile flight, and combat continue normally. The recorded
result is not revised by later damage. The browser can still pause/resume manually.
Death stops that entity's actions, while its dependents follow their owner policies.
Reset clears the registry, timers, events, RNG, and trace before the caller
repopulates the world. Disposal stops stepping and spawning and releases entities.

Resource leases control locomotion/upright overrides, bounce/impact policy,
and ignored pairs. Contact policy combines the captured snapshot, handler edits,
and current leases, preserving suppression for the contact that ends an action.
`defaultBounce` controls the default arena response; native body response remains
Matter's job. Ignored-pair leases suppress native response before its solvers.
Persistent components release their leases on detach; operations scope them to
one use. Cleanup must tolerate repeated calls.

`simulation.hit` returns connection, actual damage, knockback, statuses, and
lethal results. Shared combat also handles periodic damage and self-directed
recoil. See [status effects](status-effects-architecture.md) for timed hooks,
capability restrictions, refresh/stack rules, and source attribution.

Gameplay random choices use `simulation.rng`. Seeded RNG and stable contact order
support reproducible debugging in the same environment; full replay/networking
is deferred. `simulation.trace` keeps the most recent 500 admission, operation,
and cancellation events. Browser frame accumulation drives stepping; pausing
stops simulation time. Drawing and audio consume presentation output.

## Source map

```text
src/
├── app/game-app.ts                 browser frame loop and wiring
├── content/
│   ├── manifest.ts                 active fighter blueprint registry
│   ├── fighters/babyman/
│   │   ├── definition.ts           equipped components and move bindings
│   │   └── behavior.ts             character decisions and sequence
│   ├── fighters/granny/            equipped components and scripted actions
│   ├── fighters/alienman/          transformation and saucer arrival
│   ├── fighters/alien/             targeting and piercing laser shots
│   └── actors/saucer/              sweep, beam pulses, and deployment
├── engine/
│   ├── simulation.ts               fixed tick and gameplay resolution
│   ├── entity.ts                   identity and lifetime state
│   ├── entity-registry.ts          registration and safe world mutation
│   ├── component.ts                component container and resource leases
│   ├── behavior-runtime.ts         foreground tasks and cooldowns
│   ├── contracts.ts                shared event types
│   ├── random.ts                   seeded gameplay RNG
│   ├── physics/                    Matter contact capture and arena response
│   ├── spatial/                    segment/area queries, shapes, overlap history
│   └── scripting/                  operations, scopes, and waits
├── gameplay/
│   ├── fighter-factory.ts          common preset and typed assembly
│   ├── behavior.ts                 shared fighter/actor script installation
│   ├── match-rules.ts              team outcomes and ambient impact tuning
│   ├── components/                 movement, targeting, crawl, dash, melee, aim,
│   │                               projectile, forms, and timed visuals
│   ├── combat/                     shared effects
│   └── statuses/                   definitions, registry, and controller
├── config/                         JSON composition and shared validation
├── presentation/                   state, views, Canvas, and audio
└── rendering/sprite-geometry.ts     sprite geometry shared with Studio
```

## Current scope

Baby Man exercises targeting, wall crawl, and dash; Granny exercises melee
attacks, sprite-based aiming and shotgun fire, timed poses, and script-selected
forms. Projectile emission/flight and stun, ability-lock, and burn are
implemented. `MeleeAttack` supplies range checks and timed swings;
`SpriteAim` resolves aim geometry from the current sprite pose, and `Visuals`
provides scoped timed poses that restore prior presentation on interruption.
Alien Man and his summoned aliens are active. The saucer is a separate owned
actor using the same behavior runner as fighters. Its script sweeps horizontally,
pulses a queried area beam, then deploys three aliens after Alien Man's scripted
transformation. Alien lasers query one thick segment per shot and apply shared
combat to each enemy hit; their flashes do not cause continuing damage.
Damage-ramp mechanics and other roster behaviors remain pending migration.

`SpriteAim` can target the body sprite (Granny) or the held weapon (aliens), using
the same tracking and muzzle calculations. Held weapon settings are optional
entity presentation data; aliens use the supplied left-facing gun sprite with
configured grip pivot and barrel muzzle coordinates.
`Visuals.shape()` supplies scoped, timed shape presentation. Persistent shape
leases can use a geometry provider, so the moving saucer beam draws the same
shape used for detection. Rendering consumes snapshots and applies no effects.

Fighter behaviors receive equipped handles and their typed context, including
simulation services and the loaded roster. Spawns use the existing factory and
registry; no spawning or move-to component was added. Saucer tuning remains in
the existing `components.saucer` authored data, but there is no runtime saucer
component: its decisions and sequencing live in `content/actors/saucer`.

Scripts remain TypeScript in the repository. Add only capabilities required by
concrete content. Parallel behavior tasks, runtime-loaded mods, replay/networking,
and arbitrary independently acting weapon attachments are deferred.

See [the migration checklist](fighter-migration-checklist.md) for current work
and recorded verification. Tests do not establish browser gameplay/visual or
Studio interaction acceptance.
