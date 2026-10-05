# Fighter migration checklist

See [fighter-architecture.md](fighter-architecture.md) for the current runtime
and ownership contracts. The simulation foundation has been implemented, and
Baby Man and Granny have active blueprints. All other roster entries use the
passive setup until they receive a blueprint and behavior.

## Implemented foundation

- [x] Headless `Simulation` with a fixed 120 Hz tick, seeded gameplay RNG,
  Matter world, entity registry, contact routing, shared combat, and match rules.
- [x] Generic entity lifetime, owner-bound component container, resource leases,
  and one foreground generator task runtime with cooldown, rejection, and
  cancellation handling.
- [x] Typed fighter blueprint assembly and reusable targeting, movement,
  wall-crawl, and dash components exercised by Baby Man; blueprints support
  configured `onSpawn`, `onUpdate`, `onContact`, and `onWallContact` handlers;
  Granny also exercises declaration-ordered named actions and interruption.
- [x] Owner-bound projectile emitter and per-projectile flight component with
  configured lifetime, collision, hit, and owner/match removal policies; Granny
  equips an emitter with sprite aiming for her transformed shotgun move.
- [x] Fighter JSON composition with `components`, `moves`, and named `forms`;
  Character Studio can edit and serialize these settings.
- [x] Shared schema validation used by browser loading, Character Studio, and
  the config CLI; CLI also checks referenced assets and content IDs.
- [x] Registered timed statuses include stun, ability-lock, and burn.
- [x] Legacy JSON action execution and the previous behavior/runtime modules
  have been removed. There is no compatibility interpreter.

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

## Deferred scope

The immediate gameplay work is roster migration and only the mechanics those
fighters require. Granny now exercises reusable melee and sprite aiming, projectile
emission, scoped timed poses, named form selection, and a scripted threshold
transformation. Her handles are equipped by the definition and remain stable
across form entry; behavior explicitly chooses which handles to use. Other roster
behaviors and laser, damage-ramp, and saucer mechanics remain future work. Parallel
task scheduling, general scripting concurrency, networking/replay, and arbitrary
independently acting attachments are not part of the current foundation.

## Recorded foundation checkpoint

The preceding simulation refactor recorded 92 passing tests across 12 files,
including 10 Baby Man fixtures and 44 Studio fixtures. TypeScript, arena/Studio
production builds, configuration validation for all 10 fighters and their
referenced assets, and diff checks passed using existing dependencies.

These results describe that checkpoint; later changes need their own appropriate
verification. Browser automation was not run. Renewed Baby Man gameplay/visual
acceptance and Studio browser save/reload/undo remain outstanding.

## Granny migration verification

The Granny migration passed 113 tests across 16 files, including 11 Granny
simulation fixtures, 3 melee fixtures, and 4 aiming/render-transform fixtures.
TypeScript, arena/Studio production builds, validation for all 10 fighter configs
and referenced assets, and whitespace checks passed using existing dependencies.
Headless coverage includes threshold timing, attack cooldowns, aimed projectile
damage, recoil direction, separate instances, interrupted transformation, stale
targets, and death/removal/reset/match-end cleanup. Browser visual review remains
outstanding.

## Post-result simulation

Winner/draw announcements now occur once without stopping physics, live tasks,
statuses, combat, or spawning. Projectiles retain their normal lifetime and owner
policies. Play/pause remain available after the result; reset/disposal still clean
the world. The initial continuation check passed 115 tests across 16 files before
its three additional post-result fixtures were removed. Existing expectations
remain aligned with the new behavior; no tests were rerun for this removal.
TypeScript still reports the same 14 existing errors
from the partial `EntityConfig` migration; none were added by this change.

For verification commands see [the project README](../README.md). Record what
ran and what remains for manual review; do not equate automated checks with
browser acceptance.
