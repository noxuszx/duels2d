# Content behavior helpers

### Content helpers

Reusable character flourishes belong in `src/content/script-helpers/`, not in
gameplay components. Content helpers include `shake` (implemented with the
offset lease and timed operations), `pause-movement` (implemented with scoped
movement control), and the steering helpers below. Their formulas and
sequencing remain content code.

`until(condition)` waits for content state without a polling timer. The condition
is observed at simulation boundaries and should be a pure read. Completion
remains latched once true. It composes with `race` to stop an ongoing sequence
without adding a tick component. For delays measured from an external event,
capture `simulation.nowMs` when it happens and wait for the absolute deadline;
do not charge that event's already elapsed tick to the new delay.

`poseSequence(visuals, poses, steps)` plays configured visual steps. The fighter
script still chooses the trigger and commits a form afterward. `raySegment`
builds world-space ray geometry, and `hitEnemies` samples a supplied spatial
shape once and applies the caller's hit effects/options. Geometry, damage,
repeat timing, and visual lifetime remain independently script-controlled.

### Steering and movement helpers

The content helper `steer(entity, durationMs, velocityAt)` commands velocity in
Matter units on dynamic bodies. It acquires a locomotion lease, updates body
velocity at timed callbacks, and stops its commanded motion on cleanup. Use it
for dynamic fighters. `moveTo(entity, destination, durationMs)` is for static
actors: it acquires a locomotion lease and linearly interpolates from the
position captured at start. Dynamic fighters should use `steer`.

`shake()` returns an operation and can be yielded directly or composed with
other operations, such as `all(visuals.pose(...), shake(...))`.

Related: [timing](script-timing.md), [resources](script-resources.md), [projectiles](projectile-scripting.md).
