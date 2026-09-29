# Ability architecture

Fighters declare `combat.abilities` in their JSON. Each ability contains:

- a `trigger` that selects when and where it can activate;
- `timing` for cooldown, windup, active, and recovery durations in simulation milliseconds;
- optional `audio` hooks that map phases and successful hits to sound cues;
- an ordered set of reusable `actions`.

Current triggers:

- `nearest-enemy`
- `enemy-in-range`
- `wall-contact`

Current actions:

- `damage`
- `knockback`
- `dash`
- `wall-crawl`
- `swing`
- `spawn-projectile`
- `apply-status`
- `attack-hitbox`
- `recoil`

`apply-status` accepts an `effect` of `stun` or `ability-lock` and a positive
`durationMs`. Target actions resolve damage and knockback first. If an ability
has no `damage` or `knockback` action, a successfully applied status counts as
the connection (it may still include a `swing` or `dash`). Otherwise, statuses
apply only after damage or knockback connects.

All timing values, including cooldown, windup, active, recovery, and projectile
`lifetimeMs`, use simulation milliseconds. Ability activation goes through
`FighterAbilities.tryStart()` so cooldown, status, speed, and active-state
checks share one boundary. See the [extension guide](fighter-behavior-migration-guide.md)
for concise JSON examples and the fighter registry fallback.

`swing` rotates the configured weapon image from `startDegrees` to
`endDegrees` during the ability's active phase. Its `damage` and `knockback`
actions are applied once when the active phase begins.

```json
{
  "id": "basic-swing",
  "trigger": { "type": "enemy-in-range", "rangePadding": 20 },
  "timing": {
    "cooldownMs": 1200,
    "windupMs": 100,
    "activeMs": 83,
    "recoveryMs": 100
  },
  "audio": {
    "windup": "swing-windup",
    "active": "swing-whoosh",
    "hit": "swing-hit"
  },
  "actions": [
    { "type": "swing", "startDegrees": -70, "endDegrees": 70 },
    { "type": "damage", "amount": 12 },
    { "type": "knockback", "forceMagnitude": 0.8 }
  ]
}
```

`attack-hitbox` defines a facing-relative rectangular attack volume. Its X
offset is measured forward and mirrors automatically; its Y offset is vertical.
It remains live throughout the active phase and applies target actions to each
overlapping fighter at most once per activation.

```json
{
  "type": "attack-hitbox",
  "width": 48,
  "height": 120,
  "offset": { "x": 52, "y": -6 }
}
```

The rectangle follows the fighter's visual origin and body rotation. Character
Studio displays it as a red overlay and edits the same width, height, and offset
values used by runtime collision checks.

`recoil` applies unattributed force to the source opposite the locked firing
direction. It runs once on active entry alongside `spawn-projectile`:

```json
{ "type": "recoil", "forceMagnitude": 0.12 }
```

Projectiles no longer spawn at initial ability activation. Active-entry actions
execute after windup when the ability becomes active, including when a single
simulation update crosses the whole windup boundary.

Audio hooks support `windup`, `active`, and `hit`. The first two fire when the
ability enters that phase; `hit` fires only when target actions connect. Their
values are cue names from the fighter's sound profile or the shared profile,
not asset paths.

The Weapon tab in Character Studio configures `weaponIdle`, `weaponOffset`,
and `weaponPivot`. The pivot is fighter-relative; the image rotates around
that point while keeping its configured offset.

Runtime responsibilities are intentionally separated:

- `ability-system.ts` coordinates activation, targets, phase transitions, and
  collision-ending abilities; `fighter-abilities.ts` owns per-fighter state,
  cooldowns, and phase timing.
- `targeting.ts` owns reusable target selection.
- `action-executor.ts` translates configured actions into game effects;
  `actions/projectile-action.ts` constructs and launches the canonical
  projectile action.
- `types.ts` is the discriminated-union contract shared by configuration and
  runtime code.

## Adding an action

1. Add its configuration shape to `AbilityAction` in `src/abilities/types.ts`.
2. Add the matching JSON Schema branch in `config/fighters/fighter.schema.json`.
3. Implement the effect in `ActionExecutor` or a focused module under
   `src/abilities/actions/`.
4. Decide when `AbilitySystem` executes it: active entry, active duration,
   collision, or completion.
5. Add custom validation in `tools/validate-config.js` if schema validation
   does not cover the rule, then update docs/examples.

Actions should apply forces or request game effects. They should not contain
fighter IDs or inspect character names.

## Movement modes

`wall-crawl` is a reusable movement action. A `wall-contact` trigger starts
Baby Man's custom sequence; the behavior runs the configured wall crawl, then
the dash. The crawl follows the contacted wall at `baseSpeed * speedMultiplier`
and reverses at corners for `durationMs`. A dash configured with `endOn`
collision conditions ends on a listed collision, with a safety timeout if
neither occurs.

Teleporting is an instantaneous action and belongs in `ActionExecutor`. Its
implementation should ask the arena for a valid destination before moving the
Matter body.
