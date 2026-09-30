# Transformations

A transformation is a one-way, persistent change from a fighter's base state
to a transformed state during a match. It is separate from the short-lived
ability phases (`windup`, `active`, and `recovery`).

## Ownership

- `TransformationController` owns the `base` / `transforming` / `transformed`
  runtime state, trigger evaluation, and optional timed pose sequence.
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

An optional sequence holds the fighter in `transforming` until all its steps
finish. New attacks are blocked during this interval, but movement physics and
incoming damage continue. The transformed abilities and normal pose bank become
active only when the sequence completes; custom behavior's `onTransform` hook
also runs at completion. Without a sequence, transformation remains immediate.

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
    "sequence": [
      { "pose": "realization", "durationMs": 600 },
      { "pose": "rage", "durationMs": 800 }
    ],
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
        "realization": "assets/fighters/example/sprites/pre-transformation.png",
        "rage": "assets/fighters/example/sprites/transformation.png",
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

Sequence pose names reference the transformed presentation's pose bank; names
are not hardcoded. Each duration must be positive. Simulation time drives the
sequence, including carrying excess time across steps, rather than wall-clock
timers. The triggering tick starts the first pose without consuming its duration.

`config/fighters/granny.json` is the first complete example: at 40% health she
shows realization for 600 ms, rage for 800 ms, then switches from a rectangular
melee hitbox to a projectile attack with recoil. The shotgun pose is used for
idle and firing, and the recoil pose for recovery.

## Character Studio

Use the **Form** selector to switch between base and transformed pose/ability
banks. The Image panel edits sprites, crops, scales, and offsets for the selected
form, including custom sequence pose names. The Transform panel enables or
disables the mechanic, sets the health threshold, and edits/reorders timed
sequence steps. Preview plays the sequence and ends on the transformed idle.

Hitbox properties distinguish the shared body collision shape from the selected
form's attack rectangle. Body shapes support Edit/Apply/Cancel dragging and
resizing. Attack rectangles can be repositioned directly by dragging the red
rectangle, or by editing forward/vertical offsets; forward offsets mirror for
left-facing sprites. Projectile visual controls also follow the selected form.
Transformation changes and both ability/pose banks are included in history and
saved fighter JSON. Removing or renaming a sequence sprite updates its references.

## Extension rules

- Add reusable trigger variants to `TransformationTrigger` and evaluate them in
  `TransformationController`; do not add fighter-ID branches.
- Keep the JSON Schema and `tools/validate-config.js` aligned with new trigger
  variants.
- Put fighter-specific transformation decisions in a registered behavior and
  call the fighter's public `transform()` boundary.
- Keep attack hitboxes, recoil, status effects, and other move mechanics as
  independent ability actions rather than transformation responsibilities.
