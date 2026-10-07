# Behavior admission and contact routing

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

Related: [composition](../scripting/script-composition.md), [status effects](status-effects-architecture.md).
