# Gameplay extension guide

> Legacy runtime reference. For new content and migrations, follow
> [Fighter architecture and agent guide](fighter-architecture.md).
> The JSON-first authoring guidance below describes the existing implementation.

Use fighter JSON for ordinary moves. A fighter behavior should choose targets,
start configured abilities, and coordinate a sequence that JSON cannot express.
Keep shared combat rules in the shared systems so a new fighter does not need a
new combat branch.

## Ownership and file map

| Responsibility | Canonical location |
| --- | --- |
| Fighter data and ability definitions | `config/fighters/<id>.json` |
| Config shape and action variants | `src/abilities/types.ts` |
| JSON validation contract | `config/fighters/fighter.schema.json` |
| Additional runtime config checks | `tools/validate-config.js` |
| Behavior selection and default fallback | `src/behaviors/registry.ts`, `src/behaviors/default-behavior.ts` |
| Ability activation, timing, targeting, and phases | `src/abilities/ability-system.ts`, `src/entities/fighter-abilities.ts` |
| Target damage, knockback, and status actions | `src/abilities/action-executor.ts` |
| Shared damage rules and feedback | `src/combat/combat-resolver.ts` |
| Projectile construction and launch | `src/abilities/actions/projectile-action.ts` |
| Swing timing and weapon angle | `src/abilities/ability-system.ts`, `src/entities/fighter-abilities.ts`, `src/abilities/actions/swing-action.ts` |
| Dash component and wall-crawl action helper | `src/skills/dash-skill.ts`, `src/abilities/actions/wall-crawl-action.ts` |
| Status definitions and runtime | `src/status-effects/definitions.ts`, `src/status-effects/status-effect-controller.ts` |

`FighterBehavior` in `src/behaviors/fighter-behavior.ts` is the custom
extension point. Only Baby Man and Angry Man have registered custom
behaviors; Chef, Depressed, Happy, and Woman use
`DefaultFighterBehavior` and their JSON abilities. `createFighterBehavior()`
falls back to the default whenever an ID has no registration.

## Add a standard fighter

1. Add the fighter JSON and list it in `config/fighters/index.json`.
2. Define its trigger, millisecond timing, and actions in `combat.abilities`.
3. Leave its ID out of `BEHAVIOR_REGISTRY` in `src/behaviors/registry.ts` so
   `createFighterBehavior()` selects `DefaultFighterBehavior`.
4. Validate with `node tools/validate-config.js` and tune presentation in
   Character Studio if needed.

Use a custom behavior only when the move needs fighter-specific decision logic
or sequencing across events—for example Baby Man's wall-contact → crawl → dash
sequence. A projectile, swing, or ordinary dash by itself is already a
standard JSON action and does not justify a behavior class.

## Ability examples

These are valid ability objects for a fighter's `combat.abilities` array.
Durations use simulation milliseconds.

Melee swing (the swing controls the weapon angle; damage and knockback resolve
when the active phase begins):

```json
{
  "id": "quick-swing",
  "trigger": { "type": "enemy-in-range", "rangePadding": 20 },
  "timing": { "cooldownMs": 1200, "windupMs": 100, "activeMs": 83, "recoveryMs": 100 },
  "actions": [
    { "type": "swing", "startDegrees": -70, "endDegrees": 70 },
    { "type": "damage", "amount": 12 },
    { "type": "knockback", "forceMagnitude": 0.08 }
  ]
}
```

Projectile (spawned on successful activation; projectile lifetime is also in
milliseconds):

```json
{
  "id": "throw-tool",
  "trigger": { "type": "nearest-enemy" },
  "timing": { "cooldownMs": 1400, "windupMs": 0, "activeMs": 33, "recoveryMs": 100 },
  "actions": [{
    "type": "spawn-projectile",
    "projectile": {
      "radius": 12,
      "speed": 10,
      "damage": 18,
      "lifetimeMs": 1800,
      "image": "assets/projectiles/tool.png"
    }
  }]
}
```

Dash (the dash ends on either listed collision; damage and knockback are
resolved through the shared target-action path):

```json
{
  "id": "charge",
  "trigger": { "type": "nearest-enemy" },
  "timing": { "cooldownMs": 2000, "windupMs": 250, "activeMs": 500, "recoveryMs": 150 },
  "actions": [
    { "type": "dash", "speedMultiplier": 5, "accelerationForce": 0.018, "endOn": ["fighter-collision", "wall-collision"] },
    { "type": "damage", "amount": 30 },
    { "type": "knockback", "forceMagnitude": 0.1 }
  ]
}
```

Wall-contact sequencing (Baby Man's custom behavior starts the configured
ability on contact, selects the configured `wall-crawl` and `dash` actions by
type, then explicitly orchestrates crawl followed by dash):

```json
{
  "id": "wall-crawl-charge",
  "trigger": { "type": "wall-contact" },
  "timing": { "cooldownMs": 6000, "windupMs": 0, "activeMs": 292, "recoveryMs": 0 },
  "actions": [
    { "type": "wall-crawl", "durationMs": 2000, "speedMultiplier": 1.5 },
    { "type": "dash", "speedMultiplier": 5, "accelerationForce": 0.018, "endOn": ["fighter-collision", "wall-collision"] },
    { "type": "damage", "amount": 100 },
    { "type": "knockback", "forceMagnitude": 0.45 }
  ]
}
```

Status application (valid as a target action):

```json
{
  "id": "stunning-hit",
  "trigger": { "type": "enemy-in-range", "rangePadding": 12 },
  "timing": { "cooldownMs": 1800, "windupMs": 0, "activeMs": 33, "recoveryMs": 100 },
  "actions": [
    { "type": "damage", "amount": 10 },
    { "type": "apply-status", "effect": "stun", "durationMs": 700 }
  ]
}
```

## Adding a custom behavior or action

A custom class extends `FighterBehavior`; its hooks receive simulation
`deltaMs`. Register it in `BEHAVIOR_REGISTRY` only for the fighter that needs
the custom decision or event sequence. Start every ability with
`fighter.abilities.tryStart(ability, facing, nowMs)`. Delegate target effects
to `FighterBehaviorContext.executeTargetActions()`.

When adding a reusable JSON action, update these together: `AbilityAction` in
`src/abilities/types.ts`, the matching branch in
`config/fighters/fighter.schema.json`, its runtime handling in
`src/abilities/action-executor.ts` or the action module, and
`tools/validate-config.js` where custom checks apply. Add a concise example to
`docs/abilities.md` or this guide.

## Guardrails

- Generic systems must not branch on fighter IDs. Put fighter-specific
  sequencing in a registered behavior.
- Never bypass `FighterAbilities.tryStart()` with a direct ability start or
  duplicate cooldown checks.
- Behaviors must not call `takeDamage()` directly. Target damage, knockback,
  and status effects go through `ActionExecutor`; shared damage uses
  `combat-resolver.ts`.
- Keep TypeScript action types, JSON Schema, runtime validation, and examples
  aligned when changing configuration.
- Interruptions stop active behavior and ability phases while preserving
  cooldown history.
- Simulation timers advance by `deltaMs`; do not introduce frame-count timing.
