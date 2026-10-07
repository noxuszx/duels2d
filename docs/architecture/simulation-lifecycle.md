# Simulation lifecycle and entity ownership

## Simulation lifecycle and entity ownership

Each `step()` advances `1000 / 120` ms until the simulation is disposed.
The event delivery barrier runs before entity updates; see [event ordering](../scripting/script-events.md).
Live entities update
statuses, the active task, and component `beforeStep` hooks. Owner-death cleanup
and queued removals occur before Matter, so expired bodies cannot impart impulses.
The engine then updates physics, contains eligible bodies in the arena, resolves
wall contacts followed by captured body contacts, runs `afterStep`, and evaluates
match rules. Body contacts are sorted by runtime IDs. Remaining queued additions
and removals flush at the final mutation boundary.

Assemble through `createEntity`, which installs capabilities before calling
`simulation.add`, and retire through `simulation.remove`. Removal
changes logical liveness immediately; additions made during a step become
registered at its final boundary. Components do not mutate the Matter world
or maintain private entity/collision registries. Allocate spawned IDs with
`simulation.nextRuntimeId(prefix)`. Owner-death and owner-removal policies
explicitly choose whether dependent entities persist or are removed. Recording
the first match result retires entities whose match-end policy is `remove`;
entities with `persist` continue running.

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

Related: [scripted actors](../scripting/scripted-actors.md), [behavior runtime](behavior-runtime.md).
