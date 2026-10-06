# Scripting primitives and content boundaries

This document defines the boundary between the simulation engine, reusable
gameplay capabilities, and fighter behavior scripts.

> **No compatibility layers, intermediate adapters, or duplicate code paths.**
> Remove the old `MovementControl`, `VisualMotion`, and `Visuals.shakeWhile`
> implementations completely. Migrate their callers to the new primitives,
> even when that temporarily leaves a fighter broken during the refactor.

## Core philosophy

Fighters write content against engine tools; character-specific mechanics do
not belong in engine classes. The three layers are:

1. **Configuration** (`config/fighters/<id>.json`) contains stats, assets,
   tuning, move names, cooldowns, and form mappings. It has no execution logic.
2. **Components** (`src/gameplay/components/`) provide reusable, owner-bound
   capabilities and manage persistent lifecycle and cleanup. They do not hold
   character-specific sequences or effects.
3. **Behavior scripts** (`src/content/fighters/<id>/behavior.ts`) choose when
   and in what order to use capabilities, select targets, and compose effects.

## Timing and resource primitives

Use the implemented exports and signatures in source when authoring code.

### Timed operations

`during(durationMs, callback)` invokes its callback with `(deltaMs, elapsedMs)`
as simulation time advances. Its first callback receives `(0, 0)` when it
starts, including when the requested duration is zero. A final partial advance
is reported with its actual consumed delta. Operations report consumed
simulation time so the runtime can pass the remainder of a tick to the next
yielded operation.

`tween(durationMs, callback)` reports normalized progress from zero through
one, using simulation time. A successful completion invokes the endpoint at
progress `1`, including a zero-duration tween. Cancellation does not synthesize
the successful endpoint callback.

```ts
yield during(800, (deltaMs, elapsedMs) => {
  // Simulation-time work, such as content-authored steering or math.
});

yield tween(300, progress => {
  offset.set({ x: Math.sin(progress * Math.PI * 8) * amplitude, y: 0 });
});
```

### Scoped acquisition

`scoped(acquire, inner)` acquires a resource before running the inner generator
and releases it on completion, interruption, or cancellation. The acquisition
callback receives a scope and returns its resource or `null` when it cannot
acquire. If the initial acquisition rejects, it runs no inner work and commits
no cooldown. A move that already started an earlier operation has already
committed its cooldown. Register partial acquisitions with `scope.use(...)`;
they are released automatically if a later acquisition fails or throws.
Returned release functions or objects with `release()` are registered
automatically. A successful acquisition is an admitted operation.

```ts
yield* scoped(
  () => pauseMovement(entity),
  function* () {
    yield all(
      visuals.pose("attackWindup", 800),
      shake(entity, 800),
    );
  },
);
```

### Presentation offsets and rotations

Presentation exposes additive `acquireOffset()` and `acquireRotation()` leases.
Each lease supports `set(...)` and `release()`. Leases compose additively so a
script can add a temporary visual displacement or rotation without changing
physics or overwriting another effect. The shared presentation transform is
used consistently by the fighter body, held weapon, health bar, and muzzle
geometry; visual movement must not cause those elements to drift apart.

Offsets and rotations leave Matter body position, velocity, and colliders
unchanged. Aiming derives its world-space muzzle from the same transform as
the rendered weapon or sprite. Release each lease through a scope so it is
cleared on normal completion and cancellation.

Root offsets are world-space and root rotations are radians around the visual
root. `acquireOrientation("sprite" | "weapon", { angle, pivot? })` controls a
child's local orientation separately; the newest held child lease wins. Aiming
and wall crawl use child orientation while root effects remain additive.

### Concurrent operations

`all(...operations)` runs operations concurrently and completes when all have
completed. `race(...operations)` completes with the first operation and cancels
the remaining operations. Each operation has its own scope and cleanup.
`sequence(factory)` turns a generator sequence into an inert operation for
composition. Its factory runs only at admission. Foreground tasks and sequence
branches use the same `OperationRunner`; there is one generator execution path.
Move admission and cooldown still belong to the single foreground task.

```ts
yield all(
  sequence(patrol),
  sequence(function* () {
    yield race(until(() => deploying), sequence(beams));
    yield* deployAllies();
  }),
);
```

Each branch keeps its own operation scopes and carries unused time to its next
yield. A rejected nested operation stops the foreground task and releases all
branches. Initial rejection commits no cooldown; rejection after a task has
already started keeps the committed cooldown. Empty sequences reject without
committing cooldown. Cancellation closes generators and their scopes; synchronous
code already running reaches its next yield before closing.

Operations that may complete during an advance before consuming the full budget
must expose `nextBoundaryMs`, the time until their next possible completion.
Omitting it promises that `advance` consumes its full budget unless the
operation is already complete. Contact-only completion may omit it. Compound
operations use these boundaries to slice simulation time accurately.

Compound operation startup is sequential. Resources acquired by earlier
operations are rolled back if a later startup fails, but irreversible startup
effects cannot be undone. Put fallible resource acquisition in an outer
`scoped` operation before emission or damage operations.

### Content helpers

Reusable character flourishes belong in `src/content/script-helpers/`, not in
gameplay components. Content helpers include `shake` (implemented with the
offset lease and timed operations), `pause-movement` (implemented with scoped
movement control), and the steering helpers below. Their formulas and
sequencing remain content code.

`until(condition)` waits for content state without a polling timer. The condition
is observed at simulation boundaries and should be a pure read. Completion
remains latched once true. It composes with `race` to stop an ongoing sequence
without adding a tick component. For delays measured from an external event,
capture `simulation.nowMs` when it happens and wait for the absolute deadline;
do not charge that event's already elapsed tick to the new delay.

`poseSequence(visuals, poses, steps)` plays configured visual steps. The fighter
script still chooses the trigger and commits a form afterward. `raySegment`
builds world-space ray geometry, and `hitEnemies` samples a supplied spatial
shape once and applies the caller's hit effects/options. Geometry, damage,
repeat timing, and visual lifetime remain independently script-controlled.

### Steering and movement helpers

The content helper `steer(entity, durationMs, velocityAt)` commands velocity in
Matter units on dynamic bodies. It acquires a locomotion lease, updates body
velocity at timed callbacks, and stops its commanded motion on cleanup. Use it
for dynamic fighters. `moveTo(entity, destination, durationMs)` is for static
actors: it acquires a locomotion lease and linearly interpolates from the
position captured at start. Dynamic fighters should use `steer`.

`shake()` returns an operation and can be yielded directly or composed with
other operations, such as `all(visuals.pose(...), shake(...))`.

### Projectile emission helpers

Construct `ProjectileEmitter(context, settings)`. `emit(group)` creates an
inert group operation; `spawn(group)` performs immediate emission and returns
the spawned entities or `null`. A group is either one `{ position, direction }`
emission or an array of emissions. The whole group is validated before any
projectile is spawned. The group uses one sound and one recoil, with recoil
based on the mean unit direction; order does not affect the result, and a
balanced group has zero recoil. Emission geometry is explicit and does not
depend on firing geometry.

The content-level `burst(emitter, count, intervalMs, geometryFactory)` yields
successive groups. The factory runs again for each group, and returning `null`
ends the burst. Use current geometry at each firing point for moving or aimed
attacks.

`SpriteAim.track(target)` acquires tracking and returns a release function or
`null`. Scope it for cleanup. The former `follow` helper is removed.

Other roster behaviors remain separate gameplay work; capability availability
does not imply that every fighter has an active blueprint.

## Roadmap & future primitives

The following primitives are approved for future implementation as fighter mechanics require them:

- **Typed script events (`waitForEvent`)**: Scoped event subscriptions and `waitForEvent(entity, eventName, timeoutMs?)` with defined tick ordering. Enables counterattacks after taking damage, summons reacting to owner commands, or boomerangs/projectiles emitting return signals, without requiring polling loops or move interruption.

Additional roadmap proposals are listed below. They are not implemented APIs;
engine and component changes still follow the permission boundary below.

- **Typed operation results**: Return action outcomes to the yielding generator,
  including collision targets, completion versus timeout, and the winning branch
  of a race. Use the shared `OperationRunner` for result propagation and define
  how sequence and compound operations expose results. Enables hit-confirmed
  follow-ups and different recovery decisions without shared mutable flags.
- **Scoped background scripts**: Run child generators owned by an entity or
  script scope through the existing runner. Define cancellation, status
  restrictions, deterministic execution order, and resource conflicts explicitly.
  Enables persistent auras, orbiting defenses, or independently maintained
  effects while foreground moves retain their own admission and cooldowns.
  Add this only when concrete content cannot reasonably use `all` and `sequence`.
- **Temporary stat modifiers**: Scoped modifiers over resolved gameplay stats,
  with explicit additive/multiplicative stacking and cleanup rules. Capabilities
  read effective values at documented points rather than mutating authored
  configuration. Enables slow, haste, armor, damage buffs, and stacking rage;
  structural body/identity changes remain outside this mechanism.
- **Shared actor authoring**: Extract generic entity blueprint assembly beneath
  fighter-specific assembly, retaining the existing entity, component, behavior,
  and registry contracts. Make team, tags, ownership, and retirement policies
  explicit. Enables traps, turrets, familiars, hazards, and destructible objects
  with less repeated setup; do not introduce a second behavior runtime.
- **Behavior debugging**: Enrich traces with simulation tick/time, operation
  labels, composition branches, and relevant resource conflicts. Expose active
  tasks, cooldowns, and leases in the developer UI so rejected or stalled actions
  can be diagnosed without changing gameplay decisions.
- **Content pattern helpers**: Add orbit, pursuit, zigzag, and retreat patterns
  using `steer`; fans, rings, and rotating bursts using projectile groups; and
  periodic zones/enter-exit effects using spatial queries and `OverlapTracker`.
  These belong in `src/content/script-helpers/` and can use existing primitives
  without new engine capabilities. Scripts retain target choice, geometry,
  timing, hit effects, and lifecycle ownership.

Suggested implementation order: content pattern helpers, typed script events,
then typed operation results. Schedule the remaining proposals when a concrete
fighter or actor needs them, especially background scripts.

## Permission boundary

If a mechanic truly requires a new core component or engine modification,
explain why existing primitives cannot implement it, propose the exact design
and lifecycle, then get explicit user permission before changing the engine or
adding the component. Newly discovered engine capabilities require a proposal
and explicit approval.

Before proposing engine or component changes, check whether existing operations,
presentation leases, and content helpers can express the effect. Character
sequences and specific flourishes stay under `src/content/`; general resource
and timing primitives belong in the engine only with approval.
