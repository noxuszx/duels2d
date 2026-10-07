# Fighter migration checklist

See [fighter-architecture.md](../architecture/fighter-architecture.md) for the current runtime
and ownership contracts. The simulation foundation has been implemented, and
Baby Man, Granny, Alien Man, summoned aliens, Angry Man, Depressed Man, and Muscle Man have active blueprints. Other roster entries use the
passive setup until they receive a blueprint and behavior.

## Implemented foundation

The fixed-step simulation, owner-bound components, foreground scripts, projectiles,
shared combat/statuses, and configuration validation are implemented. Current API
contracts are linked from [the documentation index](../README.md). Recorded phase
completion and verification live in [migration history](fighter-migration-history.md).

## Remaining work

- [ ] Manually review Baby Man and Granny gameplay on the new runtime and
  Character Studio save/reload/undo behavior after the overhaul.
- [ ] Continue migrating fighters one at a time: inspect authored data and assets,
  compose needed components, write readable behavior decisions, then add each
  blueprint to `src/content/manifest.ts` only when ready.
- [ ] Implement remaining mechanics only as upcoming fighters require them.
  Authored JSON or Studio editing support alone does not make a runtime mechanic.
- [ ] Continue checking ownership, contact order, cancellation, and safe cleanup
  as new components and mechanics are added.

## Per-fighter migration

- [ ] Read the fighter JSON, assets, and current Studio serialization before
  changing its authored data.
- [ ] Record its decisions, targets, action order, cooldowns, and interruption
  behavior; preserve tuning unless balance changes are requested.
- [ ] Put reusable capabilities in components and character-specific choices in
  behavior code. Keep component tuning in JSON `components`, and move admission
  cooldowns in JSON `moves`.
- [ ] Route damage, statuses, and contact effects through shared services.
  Scope movement/presentation overrides and release them on completion,
  interruption, death, removal, reset, and disposal as applicable. Announcing
  the result preserves live actions and their resources until their normal end.
- [ ] Keep each fighter passive until its behavior is ready and registered.
- [ ] Manually check ordinary use, collisions, target validity, cooldown,
  interruption, cleanup, and Studio round trips for the migrated fighter.

## Manual acceptance still needed

- [ ] Baby wall contacts on all four sides start at most one crawl and apply the
  expected contact policy.
- [ ] Crawl follows each wall and uses configured poses, sound, duration, and
  speed; dash then chooses a current live enemy and ends under configured rules.
- [ ] No target, status restriction, interruption, death, removal, reset, or
  disposal leaves a stale task or movement/presentation lease. Match completion
  must preserve ongoing live tasks rather than freeze the world.
- [ ] Fighter JSON opens, edits, saves, reloads, and undoes in Character Studio
  without losing component, move, pose, or named-form fields.
- [ ] Representative passive opponents remain usable in matches.
- [ ] Granny swings toward enemies, shows realization and rage for one second
  each at 40% health, and then fires aimed shots with backward recoil. Review
  sprite placement, muzzle alignment, both facings, and restart in the browser.

Historical phase details and recorded checks live in
[migration history](fighter-migration-history.md). API contracts live in the
[scripting reference](../scripting/scripting-primitives.md); planned work lives in the
[roadmap](../scripting/scripting-roadmap.md).
