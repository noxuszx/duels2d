# Ability architecture

Fighters declare `combat.abilities` in their JSON. Each ability contains:

- a `trigger` that selects when and where it can activate;
- `timing` for cooldown, windup, active, and recovery phases;
- an ordered set of reusable `actions`.

Current triggers:

- `nearest-enemy`
- `enemy-in-range`

Current actions:

- `damage`
- `knockback`
- `dash`
- `swing`
- `spawn-projectile`

`swing` rotates the configured weapon image from `startDegrees` to
`endDegrees` during the ability's active frames. Its `damage` and `knockback`
actions are applied once when the active phase begins.

```json
{
  "id": "basic-swing",
  "trigger": { "type": "enemy-in-range", "rangePadding": 20 },
  "timing": {
    "cooldownMs": 1200,
    "windupFrames": 12,
    "activeFrames": 10,
    "recoveryFrames": 12
  },
  "actions": [
    { "type": "swing", "startDegrees": -70, "endDegrees": 70 },
    { "type": "damage", "amount": 12 },
    { "type": "knockback", "forceMagnitude": 0.8 }
  ]
}
```

The Weapon tab in Character Studio configures `weaponIdle`, `weaponOffset`,
and `weaponPivot`. The pivot is fighter-relative; the image rotates around
that point while keeping its configured offset.

Runtime responsibilities are intentionally separated:

- `ability-system.ts` owns activation, phase transitions, targets, and
  collision-ending abilities.
- `targeting.ts` owns reusable target selection.
- `action-executor.ts` translates configured actions into game effects.
- `types.ts` is the discriminated-union contract shared by configuration and
  runtime code.

## Adding an action

1. Add its configuration shape to `AbilityAction` in `src/abilities/types.ts`.
2. Add the matching JSON Schema branch in `config/fighters/fighter.schema.json`.
3. Implement the effect in `ActionExecutor`.
4. Decide when `AbilitySystem` executes it: activation, active frames,
   collision, or completion.
5. Add the action to a fighter's `actions` array.

Actions should apply forces or request game effects. They should not contain
fighter IDs or inspect character names.

## Movement modes

Persistent movement such as wall walking should live in a separate movement
controller rather than in `ActionExecutor`. An ability action can activate a
named movement mode for a duration, while the movement system owns its ongoing
forces and collision behavior.

Teleporting is an instantaneous action and belongs in `ActionExecutor`. Its
implementation should ask the arena for a valid destination before moving the
Matter body.
