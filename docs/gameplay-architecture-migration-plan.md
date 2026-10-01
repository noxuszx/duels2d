# Gameplay architecture migration plan

> Legacy migration record. The agreed next architecture and migration workflow
> are in [Fighter architecture and agent guide](fighter-architecture.md).
> The ownership below describes the earlier JSON-runner design, not the new target.

## Target ownership

- Fighter JSON declares standard ability triggers, timing, and actions.
- `FighterBehavior` chooses and sequences fighter-specific behavior only.
- `FighterAbilities.tryStart()` is the authoritative ability start boundary;
  `FighterAbilities` owns phases and cooldown history.
- `AbilitySystem` coordinates targeting and phase execution.
- `ActionExecutor` applies target effects; `combat-resolver.ts` owns shared
  damage rules and feedback.
- `StatusEffectController` owns effect durations, source attribution, refresh,
  and combined capabilities.
- Presentation and audio respond to gameplay events; they do not decide hits.

Target registered behaviors: Baby Man and Angry Man. Chef, Depressed, Happy,
and Woman use `DefaultFighterBehavior` with standard JSON actions.

## Invariants

1. The fixed simulation runs at 120 Hz; gameplay durations use simulation
   milliseconds.
2. Every ability starts through `FighterAbilities.tryStart()`.
3. Casting locks prevent new starts and do not interrupt a current dash.
4. Interruptions stop the current ability and behavior while retaining cooldown
   history.
5. Behaviors do not call `takeDamage()`; target effects use
   `ActionExecutor.executeTargetActions()` and shared damage resolution.
6. Generic systems do not contain fighter-ID gameplay branches.
7. A fighter's own dash does not cause impact damage to itself; direct attacks
   and projectiles remain able to damage it.
8. Baby Man's wall-contact sequence remains crawl then dash. The winner keeps
   moving after match resolution, without further combat damage.
9. TypeScript action types, JSON Schema, runtime validation, and examples move
   together.
10. Stun disables voluntary control while physics, pending force, knockback,
    collisions, and wall bounce remain active.

## Phase status

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Regression baseline | Implemented; manual validation pending | Automated regression coverage and a manual checklist exist. Browser matchup verification has not been recorded. |
| 1. Centralize ability activation | Implemented | Standard and custom paths use `FighterAbilities.tryStart()`. |
| 2. Unify combat results and actions | Implemented | Typed combat results, shared damage resolution, target action execution, and wall responses are present; Phase 5 removed the old duplicate projectile and swing paths. |
| 3. Use millisecond ability timing | Implemented | Ability phases and configuration use millisecond fields. |
| 4. Add status effects | Implemented | `stun`, `ability-lock`, capability aggregation, timed application, interruption, cleanup, and the `apply-status` action are present. No live fighter has that action configured. |
| 5. Simplify behaviors and skills | Implemented | `src/behaviors/registry.ts` registers only Baby Man and Angry Man. The other four fighters use `DefaultFighterBehavior`; duplicate projectile/swing behavior and skill files have been removed. |
| 6. Documentation hardening | Documentation updated; manual validation pending | The extension guide, action/status docs, and config guide describe the current APIs. No browser matchup verification is claimed. |

## Remaining validation

- Run the manual browser matchup checklist for Baby Man wall contact and dash,
  Angry Man charge, a standard melee fighter, and a standard projectile fighter.
- Confirm victory movement/camera tracking and that no post-victory damage is
  applied.
- Record the manual results separately; automated test success does not imply
  browser verification.
