# Transformations

A transformation is a one-way, persistent change from a fighter's base state
to a transformed state during a match. It is separate from the short-lived
ability phases (`windup`, `active`, and `recovery`).

## Ownership

- `TransformationController` owns the `base` / `transformed` runtime state and
  trigger evaluation.
- `Fighter` synchronizes a successful transformation with abilities,
  presentation, and custom behavior.
- `AbilitySystem` evaluates automatic transformations once per simulation tick
  before behavior updates.
- `FighterPresentation` owns independent base and transformed pose banks.
- Behaviors select from `fighter.activeAbilities`; they do not inspect
  transformation configuration directly.

Transforming interrupts the current ability and resets temporary behavior
state. Ability cooldown history remains intact. A transformation is latched for
the remainder of the match and returns to the base state on reset.

## Configuration

The first supported automatic trigger is a health ratio threshold. The exact
threshold transforms, so `0.4` activates at 40% health or below.

```json
{
  "transformation": {
    "trigger": {
      "type": "health-threshold",
      "healthRatio": 0.4
    },
    "combat": {
      "abilities": [
        {
          "id": "transformed-attack",
          "trigger": { "type": "nearest-enemy" },
          "timing": {
            "cooldownMs": 1200,
            "windupMs": 150,
            "activeMs": 50,
            "recoveryMs": 300
          },
          "actions": [
            { "type": "damage", "amount": 20 }
          ]
        }
      ]
    },
    "presentation": {
      "poses": {
        "idle": "assets/fighters/example/sprites/transformed-idle.png",
        "attackWindup": "assets/fighters/example/sprites/transformed-windup.png",
        "attackActive": "assets/fighters/example/sprites/transformed-attack.png",
        "recovery": "assets/fighters/example/sprites/transformed-recovery.png"
      }
    }
  }
}
```

Omitting transformed abilities or poses makes that part inherit the base
configuration. Code-driven transformations may call `fighter.transform()`
explicitly; the controller still guarantees that the transition occurs only
once.

## Extension rules

- Add reusable trigger variants to `TransformationTrigger` and evaluate them in
  `TransformationController`; do not add fighter-ID branches.
- Keep the JSON Schema and `tools/validate-config.js` aligned with new trigger
  variants.
- Put fighter-specific transformation decisions in a registered behavior and
  call the fighter's public `transform()` boundary.
- Keep attack hitboxes, recoil, status effects, and other move mechanics as
  independent ability actions rather than transformation responsibilities.
