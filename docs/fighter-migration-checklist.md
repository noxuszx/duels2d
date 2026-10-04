# Fighter migration checklist

See [fighter-architecture.md](fighter-architecture.md) for the current runtime
and ownership contracts. The simulation foundation has been implemented, and
Baby Man is the only actively scripted fighter. All other roster entries use
the passive setup until they receive a blueprint and behavior.

## Implemented foundation

- [x] Headless `Simulation` with a fixed 120 Hz tick, seeded gameplay RNG,
  Matter world, entity registry, contact routing, shared combat, and match rules.
- [x] Generic entity lifetime, owner-bound component container, resource leases,
  and one foreground generator task runtime with cooldown, rejection, and
  cancellation handling.
- [x] Typed fighter blueprint assembly and reusable targeting, movement,
  wall-crawl, and dash components exercised by Baby Man; blueprints support
  configured `onSpawn`, `onUpdate`, `onContact`, and `onWallContact` handlers.
- [x] Owner-bound projectile emitter and per-projectile flight component with
  configured lifetime, collision, hit, and owner/match removal policies; covered
  by headless simulation fixtures, though not yet equipped by a roster fighter.
- [x] Fighter JSON composition with `components`, `moves`, and named `forms`;
  Character Studio can edit and serialize these settings.
- [x] Shared schema validation used by browser loading, Character Studio, and
  the config CLI; CLI also checks referenced assets and content IDs.
- [x] Registered timed statuses include stun, ability-lock, and burn.
- [x] Legacy JSON action execution and the previous behavior/runtime modules
  have been removed. There is no compatibility interpreter.

## Remaining work

- [ ] Manually review Baby Man gameplay on the new runtime and Character Studio
  save/reload/undo behavior after the overhaul.
- [ ] Select the next fighter or new character after Baby Man review, implementing
  only the reusable capabilities its behavior needs.
- [ ] Migrate fighters one at a time: inspect their authored data and assets,
  compose needed components, write readable behavior decisions, then add each
  blueprint to `src/content/manifest.ts` only when ready.
- [ ] Equip implemented mechanics as needed and implement remaining mechanics
  for upcoming fighters, including runtime form/transformation execution.
  Existing JSON or Studio editing support alone does not mean a runtime mechanic
  exists.
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
  interruption, death, removal, reset, and match end as applicable.
- [ ] Keep the fighter passive until its behavior is ready and registered.
- [ ] Manually check ordinary use, collisions, target validity, cooldown,
  interruption, cleanup, and Studio round trips for the migrated fighter.

## Manual acceptance still needed

- [ ] Baby wall contacts on all four sides start at most one crawl and apply the
  expected contact policy.
- [ ] Crawl follows each wall and uses configured poses, sound, duration, and
  speed; dash then chooses a current live enemy and ends under configured rules.
- [ ] No target, status restriction, interruption, death, removal, reset, or
  match end leaves a stale task or movement/presentation lease.
- [ ] Fighter JSON opens, edits, saves, reloads, and undoes in Character Studio
  without losing component, move, pose, or named-form fields.
- [ ] Representative passive opponents remain usable in matches.

## Deferred scope

The immediate next gameplay work is roster migration and only the mechanics
those fighters require. Projectile emission and flight are implemented, but
no roster fighter equips them yet; transformation/form execution still needs
implementation before a fighter can rely on it. Parallel task scheduling,
general scripting concurrency, networking/replay, and arbitrary independently
acting attachments are not part of the current foundation.

## Recorded foundation checkpoint

The preceding simulation refactor recorded 92 passing tests across 12 files,
including 10 Baby Man fixtures and 44 Studio fixtures. TypeScript, arena/Studio
production builds, configuration validation for all 10 fighters and their
referenced assets, and diff checks passed using existing dependencies.

These results describe that checkpoint; later changes need their own appropriate
verification. Browser automation was not run. Renewed Baby Man gameplay/visual
acceptance and Studio browser save/reload/undo remain outstanding.

This documentation cleanup uses source, local-link, and diff inspection only.
For verification commands see [the project README](../README.md). Record what
ran and what remains for manual review; do not equate automated checks with
browser acceptance.
