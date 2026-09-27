# Status Effects Architecture

Give every fighter a `StatusEffectController` that tracks active effects and
their remaining duration.

Other systems should ask what the fighter can currently do:

```ts
fighter.statuses.canStartAbilities
fighter.statuses.canContinueAbility
fighter.statuses.canUseMovement
```

Start with two effects:

- **Stun:** interrupts abilities, prevents casting, and disables voluntary
  movement.
- **Ability lock:** prevents new abilities, but allows movement and the current
  ability to finish.

A stunned fighter should remain physically active. It can still be knocked
around, pushed, and bounced off walls; it simply cannot control itself.

Abilities can apply statuses with a new action:

```json
{
  "type": "apply-status",
  "effect": "stun",
  "durationMs": 700
}
```

Casting restrictions should be enforced inside `FighterAbilities` so custom
fighter behaviors cannot bypass them accidentally.

## Implementation order

1. Create the status controller.
2. Attach it to every fighter.
3. Block ability activation centrally.
4. Add ability interruption.
5. Disable voluntary movement during stun.
6. Add `apply-status` to ability actions and the fighter JSON schema.
7. Add tests for duration, refreshing, interruption, and cooldown behavior.

This foundation can later support slows, poison, shields, regeneration, and
stat buffs.
