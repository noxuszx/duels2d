# Projectile emission and lifecycle events

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

### Projectile lifecycle events

`onProjectileEvents(projectile, handlers)` from `src/content/script-helpers/`
subscribes to the projectile's `ProjectileFlight.events` typed source and returns
an idempotent unsubscribe function. Removed entities or entities without flight
raise an authoring error. No extra component or alternate contact path is installed.

```ts
onProjectileEvents(projectile, {
  onImpact({ position, other, result }) {
    // Hit resolution has finished; result includes actual damage and whether it connected.
  },
  onWall() {
    simulation.remove(projectile.runtimeId, "hit");
  },
  onEnd({ position, reason }) {
    if (reason === "hit" || reason === "expired") {
      miniTear.spawn(diagonals.map(direction => ({ position, direction })));
    }
  },
});
```

Events include `projectile`, `position`, and `nowMs`. Position is an immutable
copy of the body center at event capture, not an exact surface contact point.
Impact events include the target `other` and an immutable copy of `HitResult`.
Entity references remain live objects; retain the copied position for later effects.

`onImpact` runs once per eligible enemy target processed by flight, after hit
resolution, including zero-damage or blocked hits. Piercing hits do not end the
projectile. Allies, non-targetable entities, repeated targets, and owner catches
do not generate enemy impacts. `onWall` runs for each wall contact delivered to
flight, before the simulation's default bounce.

`onEnd` runs exactly once on removal, after flight releases its resources, with
the actual `EntityRemovalReason`. Expiry, consumption, owner retirement, match
retirement, reset, and manual removal use the same path. Reasons are not remapped:
for example, a reset that first removes an owner can retire its child with
`"owner-removed"`. Content explicitly chooses which reasons cause gameplay effects.

Normal hit ordering is resolution, impact notification, configured consumption,
then end notification. Wall notification precedes content removal or default
bounce. Removal inside a contact callback is immediate, but end notification
waits for the active contact notification to finish. Subscribers run in registration
order; additions during notification observe future events, and unsubscribed
listeners are skipped. Recursive contact dispatch is ignored while flight processes
its current contact. Callback failures still allow other listeners, configured
consumption, and cleanup to finish before the first error propagates.

Callbacks run synchronously and are not generator tasks. For delayed effects,
spawn an actor using the surviving owner's context, then yield timed operations
inside that actor's script. Subscriptions last until projectile removal unless
released earlier; `scope.use(onProjectileEvents(...))` ties observation to a scope.
An optional third `scope` argument provides the same ownership directly. The
source publishes `impact`, `wall`, and `end`, then closes after its terminal
notification; helpers and generator waits observe this one source.
Depressed Man's cluster tear uses this helper for wall consumption and one end burst.

Related: [event waits](script-events.md), [scripted actors](scripted-actors.md).
