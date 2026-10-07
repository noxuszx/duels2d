# Recorded migration checkpoints

Historical implementation and verification notes. These are records of checks
at their original checkpoint, not current API contracts or new approval grants.
For current work, use [the migration checklist](fighter-migration-checklist.md).

## Approved scripting phases

- [x] **Phase 1 implemented and verified.** The scope was
  simulation-time `during`/`tween`, failure-safe `scoped` acquisition,
  additive presentation offset/rotation leases, and content-level shake and
  pause-movement helpers.
- [x] Remove `MovementControl`, `VisualMotion`, and `Visuals.shakeWhile`
  completely and migrate every caller. No compatibility layers, intermediate
  adapters, or duplicate code paths are allowed; temporary fighter breakage
  during migration is acceptable.
- [x] Verify that failed initial scoped acquisition runs no inner sequence and commits
  no cooldown, partial acquisition is released, `during` receives its initial
  zero-time callback and final partial delta, and successful `tween` completion
  reaches one while cancellation does not synthesize the endpoint.
- [x] Verify additive offset/rotation through the shared body, weapon, health
  bar, and muzzle presentation transform.
- [x] Implement content steering and kinematic movement helpers, explicit
  single/group projectile emissions, and timed content bursts.
- [x] Implement `all`/`race` with branch scopes and exact shared timing;
  migrate affected API calls and remove replaced APIs.
- [x] Complete active behavior cleanup: shared generator execution and
  `sequence` composition, scripted saucer patrol/lifecycle, condition waits,
  shared transformation poses and spatial-hit content helpers.

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

## Scripting phase 2/3 scope

The immediate gameplay work is roster migration and only the mechanics those
fighters require. Granny now exercises reusable melee and sprite aiming, projectile
emission, scoped timed poses, named form selection, and a scripted threshold
transformation. Her handles are equipped by the definition and remain stable
across form entry; behavior explicitly chooses which handles to use. Other roster
behaviors remain future work. Muscle Man's damage ramp and wall-returning dumbbell
use content timing, projectile events, and steering without a new component.
Alien Man's owned saucer
and aliens use separate scripts, spatial queries, shared shape presentation,
existing aiming, and owner cleanup. Parallel foreground task scheduling,
networking/replay, and arbitrary
independently acting attachments are not part of the current foundation.

- [x] **Phases 2/3 implemented and verified.** Added content-authored steering
  helpers, explicit single/group projectile emission and content-level bursts,
  concurrent `all` and `race` operation composition, and migrated existing
  active fighters off special composition wrappers. This work does not add full
  task concurrency or fighter-specific mechanics to engine code.

Remaining passive-roster behavior is separate gameplay scope; these scripting
phases do not establish that every fighter has an active blueprint.

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
At that checkpoint, TypeScript reported 14 errors from the partial `EntityConfig`
migration. The subsequent entity-boundary completion resolves those errors,
normalizes generic configuration defaults, and retains typed fighter contexts.
TypeScript and arena/Studio builds pass; existing tests were reused, with no new
fixtures added for that completion.

For verification commands see [the project README](../../README.md). Record what
ran and what remains for manual review; do not equate automated checks with
browser acceptance.

## Alien Man migration

Alien Man spawns an owned saucer that sweeps and beams until his two-second
transformation completes at 50% health. Deployment then occurs at +1, +4, and
+7 seconds. Three 100-health aliens inherit his team and owner cleanup, aim their
held weapon independently, and fire instantaneous piercing lasers every two
seconds. Owner death/removal and reset clean up dependent actors; announcing a
match result preserves ongoing simulation.

Focused simulation fixtures cover sweep bounds and moving beam geometry, timed
damage and ally filtering, transformation/deployment and owner-death cleanup,
and piercing laser hits, weapon tracking, flash lifetime, and reset. Browser
review is still needed for sprite sizing, muzzle placement, beam visibility,
and restart. The supplied alien gun image is assigned for idle and firing,
with left-facing artwork and initial grip/muzzle alignment in the alien config.

Verification passed: TypeScript, arena/Studio production builds, configuration
and asset validation for all 10 definitions, and 121 tests across 18 files.
The new Alien Man file contains four integrated scenarios. Browser gameplay
and visual review have not been performed.

Follow-up tuning uses 10 damage per saucer beam pulse at roughly six pulses per
second, and 30 damage per alien laser shot. Shape visuals are clipped to the arena
and its border draws above them to hide beam ends at the boundary.
Summoned aliens now apply the global speed multiplier and ordinary fighter spawn
velocity proportions. Sprite hit flashes are tinted on an isolated cached canvas
so the beam behind transparent sprite pixels cannot fill the sprite rectangle.
TypeScript, config validation, and eight Alien Man/aiming checks passed for this
follow-up; visual acceptance remains a browser review.

## Angry Man migration

Angry Man's original stop/shake/charge sequence is restored through an active
blueprint and readable behavior script. Targeting and dash are shared with other
fighters. Content-level `pause-movement` and `shake` helpers keep reusable
flourishes out of engine components; windup sound releases with its timed pose.
His authored timing, hit effects, sprite settings, and six-second cooldown are
preserved. The charge duration uses `race` with the configured 183 ms active
duration as a simulation-time cap.

Focused scenarios cover windup without physical jitter, sound cleanup, active
duration/recovery/cooldown, collision damage and knockback, stale-target fallback,
no-enemy idling, and interrupted/removal cleanup. Browser review is still needed
for shake readability, charge feel, sprite alignment, and audio.

TypeScript, arena/Studio builds, config/asset validation, and 28 focused Angry
Man, Baby Man, Granny, and aiming checks passed. Four scenarios were added for
Angry Man; browser gameplay and audio review remain outstanding.

## Scripting primitives verification

Phase 1 passed all 150 tests across 23 files, TypeScript, the combined arena and
Studio production build, config/asset validation for all 10 fighter definitions,
and whitespace checks. Coverage includes partial tick budgets, zero durations,
exact tween endpoints, rejected acquisition without cooldown, cleanup after
exceptions and reentrant cancellation, additive leases, both facing directions,
and agreement between rendered transforms and world-space muzzle geometry.

Angry Man now uses content-level pause and shake helpers. Wall crawl, melee,
projectile spin, and sprite/weapon aiming use the new root and child leases;
removed APIs have no adapters or fallback paths. The Studio aim fixture uses
the new geometry frame, and its null-crop fixture now explicitly establishes
that condition rather than inheriting Granny's authored crop. Browser gameplay,
visuals, audio, and Studio interactions still require manual review.

## Scripting phases 2/3 verification

Phases 2/3 and active behavior cleanup passed 204 tests across 26 files,
TypeScript, the combined arena and Studio production build, configuration and
asset validation for all 10 fighter definitions, and diff checks. Coverage
includes steering cleanup, static actor movement, grouped emission validation
and recoil, burst geometry, aiming tracking cleanup, concurrent operation
timing, startup rollback, dash force invariance when a tick is subdivided, and
the current fighter behavior migrations. Browser gameplay, visual, audio, and
Studio interaction review remain outstanding. Passive-roster behavior remains
separate work.

## Active behavior cleanup

The saucer now runs `all(sequence(patrol), sequence(lifecycle))`. Movement uses
`moveTo` instead of a custom sweep component. Its beam is scoped and raced
against a content condition wait; spawning uses absolute deadlines from the
captured deployment timestamp, preserving +1/+4/+7 seconds. Movement carries
unused time across wall reversals and continues during deployment and after a
match result. Zero-width travel intervals still consume simulation time.

Granny and Alien Man share `poseSequence` for configured transformation steps,
while their scripts own thresholds and form entry. Summoned aliens use shared
ray geometry and explicit query-hit helpers. Baby Man's crawl/retarget/dash and
Angry Man's scoped pause/all windup/race charge already use the new primitives
and remain concise; they were reviewed without cosmetic rewrites.

Foreground tasks and composed sequences share `OperationRunner`; the previous
inlined execution path was removed. Nested rejection and cancellation stop all
branches and release their scopes. There is no compatibility scheduler. The
verification results above include this cleanup; browser gameplay, visual,
audio, and Studio review remain outstanding.

Related: [current scripting contracts](../scripting/scripting-primitives.md).
