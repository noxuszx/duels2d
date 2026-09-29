# Status effects

Each `Fighter` owns a `StatusEffectController` (`fighter.statuses`). The
controller stores active effects and exposes combined capabilities; gameplay
systems ask what actions are currently allowed instead of scattering checks
for named effects.

```ts
fighter.statuses.canStartAbilities
fighter.statuses.canContinueAbility
fighter.statuses.canUseMovement
```

## Current effects and rules

- `stun` blocks new abilities, interrupts the active ability and behavior, and
  disables voluntary movement. Its physics body remains active: pending force,
  knockback, collisions, and wall bounce still work.
- `ability-lock` blocks new ability starts only. It does not interrupt an
  active ability or prevent movement.
- Restrictions from simultaneous effects combine: a capability is allowed
  only when every active effect allows it.
- Effects run on deterministic simulation time via `update(deltaMs)`. A
  duration expires at its boundary; timers do not depend on render rate.
- Reapplying an effect keeps the longer of its current remaining duration and
  the new duration. The most recent application replaces `sourceId`, even when
  it does not extend the timer. Different effect IDs coexist.
- Statuses are cleared when a fighter dies and on match reset. Interrupting an
  ability preserves its cooldown history.

Abilities use the `apply-status` action:

```json
{ "type": "apply-status", "effect": "stun", "durationMs": 700 }
```

`ActionExecutor.executeTargetActions()` applies status actions after damage or
knockback connects. When an ability has no damage or knockback action, applying
a status is itself the connection, even if the ability also contains a swing
or dash action. `sourceId` is set to the attacking fighter's ID. No live
fighter currently has `apply-status` configured; the runtime and configuration
support are ready for a future move to use it.

## Extending the system

1. Add the ID and capability definition in `src/status-effects/types.ts` and
   `src/status-effects/definitions.ts`.
2. Choose the effect's capability restrictions. Add stacking or stat-modifier
   data only with an explicit policy; do not overload unrelated capabilities.
3. Add lifecycle handling if needed. Keep effect durations in simulation
   milliseconds, define refresh/stack and source-attribution behavior, and
   clear state on death and match reset.
4. If fighters can receive the effect from JSON abilities, update
   `ApplyStatusAction` in `src/abilities/types.ts`, the `apply-status` branch
   in `config/fighters/fighter.schema.json`, runtime checks in
   `tools/validate-config.js`, and docs/examples together.
5. Enforce restrictions at the shared ownership boundary (ability start,
   ability continuation, or voluntary movement). Preserve physics and external
   forces unless the effect explicitly requires a separate physics rule.

The controller combines capabilities; `Fighter`, `FighterAbilities`,
`AbilitySystem`, and `CombatSystem` enforce them at their respective shared
boundaries. Avoid adding `if (status === "stun")` checks to individual fighter
implementations.
