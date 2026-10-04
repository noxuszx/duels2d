# Status effects

Each `Entity` owns a `StatusController` at `entity.statuses`. Effect modules live
under `src/gameplay/statuses/`; registry keys derive the `StatusId` type. Shared
code asks combined capabilities instead of checking effect names in fighters.

```ts
entity.statuses.canStartCast
entity.statuses.canContinueCast
entity.statuses.canMove
entity.statuses.capabilities
entity.statuses.list()
```

## Current effects and lifecycle

| Effect | Rules |
| --- | --- |
| `stun` | Blocks new tasks, cancels the current task, and prevents voluntary movement |
| `ability-lock` | Blocks new tasks while permitting an existing task and movement |
| `burn` | Deals 2 damage per stack every 500 simulation milliseconds, up to 3 stacks |

Restrictions combine: a capability is allowed only when every active effect
allows it. The behavior runtime enforces task permissions; common movement
checks movement permission. New control mechanics must honor these capabilities.
Stun leaves the Matter body active, permitting drift, external forces, knockback,
and collisions. Cancelled tasks do not resume when a restriction expires.

Effects update before active tasks/components using simulation time. The last
tick consumes only remaining duration, with tolerance for exact fixed-tick
boundaries. Periodic damage routes through shared combat and bypasses the usual
contact-damage cooldown. Death/removal/reset clear effects; ordinary task
interruption retains move cooldown history.

Reapplication normally keeps the larger remaining duration; a module can choose
`refresh: "replace"`. Stacks increase up to `maxStacks`, and refresh does not
restart periodic phase. A provided source ID replaces the earlier source;
omitting it retains the source on refresh. `onApply` runs for a new instance,
and `onExpire` runs on expiry or clearing.

## Apply an effect

Inside a reusable combat mechanic, apply an attack's statuses through shared hits:

```ts
const result = simulation.hit(source, target, {
  damage: 10,
  statuses: [{ id: "stun", durationMs: 700 }],
});
```

The source/target must be live registered enemies. Statuses apply after damage
or knockback connects; a status-only hit can itself establish connection:

```ts
simulation.hit(source, target, {
  statuses: [{ id: "ability-lock", durationMs: 700 }],
});
```

A mechanic can also apply directly through the controller:

```ts
const applied = target.statuses.apply({
  id: "burn",
  durationMs: 1500,
  sourceId: source.runtimeId,
});
```

`apply` reports application/refresh or rejects an unknown ID, invalid duration,
or inactive owner. Direct application does not establish attack connection or
emit a shared combat status event. Current JSON component hit settings expose
damage/knockback; statuses are supplied through the TypeScript combat API.

## Add an effect

1. Add a module implementing `StatusDefinition` under `src/gameplay/statuses/`.
2. Choose restrictions and explicit refresh/stack policy. Use supplied instance
   state and `deltaMs` for periodic work.
3. Register the module in `registry.ts`; ID types derive from this manifest.
4. Apply through reusable mechanics and shared combat/controller APIs.
5. Verify expiry, refresh/stack limits, attribution, task permission changes,
   and death/removal/reset cleanup.

A restriction-only module follows the existing ability-lock pattern:

```ts
import type { StatusDefinition } from "./types";

export const silence = {
  id: "silence",
  restrictions: { canStartCast: false },
} as const satisfies StatusDefinition;
```

This is an authoring example, not a registered effect. For periodic hooks and
rounding tolerance, inspect [burn](../src/gameplay/statuses/burn.ts).
`StatusContext.damage` uses shared combat; hooks should not alter health directly
or introduce browser timers. Inspect the [contracts](../src/gameplay/statuses/types.ts)
and [controller](../src/gameplay/statuses/controller.ts) before extending them.

See [architecture](fighter-architecture.md) for lifecycle ownership and
[authoring](fighter-authoring.md) for composing mechanics into fighters.
