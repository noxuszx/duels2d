# Proposed scripting capabilities

## Roadmap & future primitives

[Typed events](script-events.md) and [operation results](script-results.md) are implemented. The remaining
roadmap proposals below are not implemented APIs;
engine and component changes still follow the [engine permission boundary](../architecture/engine-boundaries.md#permission-boundary).

- **Scoped background scripts**: Run child generators owned by an entity or
  script scope through the existing runner. Define cancellation, status
  restrictions, deterministic execution order, and resource conflicts explicitly.
  Enables persistent auras, orbiting defenses, or independently maintained
  effects while foreground moves retain their own admission and cooldowns.
  Add this only when concrete content cannot reasonably use `all` and `sequence`.
- **Temporary stat modifiers**: Scoped modifiers over resolved gameplay stats,
  with explicit additive/multiplicative stacking and cleanup rules. Capabilities
  read effective values at documented points rather than mutating authored
  configuration. Enables slow, haste, armor, damage buffs, and stacking rage;
  structural body/identity changes remain outside this mechanism.
- **Behavior debugging**: Enrich traces with simulation tick/time, operation
  labels, composition branches, and relevant resource conflicts. Expose active
  tasks, cooldowns, and leases in the developer UI so rejected or stalled actions
  can be diagnosed without changing gameplay decisions.
- **Content pattern helpers**: Add orbit, pursuit, zigzag, and retreat patterns
  using `steer`; fans, rings, and rotating bursts using projectile groups; and
  periodic zones/enter-exit effects using spatial queries and `OverlapTracker`.
  These belong in `src/content/script-helpers/` and can use existing primitives
  without new engine capabilities. Scripts retain target choice, geometry,
  timing, hit effects, and lifecycle ownership.

Suggested implementation order: content pattern helpers next. Schedule the remaining proposals when a concrete
fighter or actor needs them, especially background scripts.

Related: [current migration work](../migration/fighter-migration-checklist.md).
