# Fighter architecture

The simulation foundation is implemented. Gameplay runs in a headless, fixed
120 Hz simulation with explicit fighter definitions, reusable owner-bound
components, and one foreground behavior task per fighter. See the
[migration checklist](../migration/fighter-migration-checklist.md) for active roster status.
Fighter JSON and Character
Studio now use `components`, `moves`, and named `forms` as editable data.

The browser application owns real-time frame accumulation, input/UI, assets,
audio, and Canvas rendering. It calls `Simulation.step()` and draws the resulting
presentation state. Browser APIs do not decide gameplay timing.

```text
fighter JSON ──> composed config ──> createFighter + optional blueprint
                                          │
                                          ├── owner-bound components
                                          └── behavior handlers
                                                  │
Simulation: seeded RNG, 120 Hz clock, Matter world, registry, contacts, combat
                                                  │
Browser app: frame accumulator ──> step ──> presentation view ──> Canvas/audio
```

## Ownership

| Part | Owns |
| --- | --- |
| `Simulation` | Fixed tick and simulation time, Matter world, entity registry, seeded gameplay RNG, contact collection/resolution, shared combat and match rules |
| `Entity` | Runtime identity, team, body, health, presentation state, statuses, component container, and behavior runtime attachment |
| Component | A persistent capability bound to one entity; its own settings, tick/contact hooks, and detach cleanup |
| Behavior | Character decisions, target selection, and ordering of yielded operations |
| `BehaviorRuntime` | One foreground generator task, move cooldowns, admission/rejection, simulation-time advancement, cancellation, and tracing |
| `ScriptOperation` and `ScriptScope` | One action use and its scoped resource leases/cleanup callbacks |
| `OperationRunner` | Shared generator execution for foreground moves and composed sequence branches, including per-yield time budgets and scopes |
| Combat and status services | Shared hit/damage/knockback results and registered timed status effects |
| Browser app and presentation | Frame accumulation, rendering, asset and audio adapters, UI, and presentation output |
| JSON and Character Studio | Editable identity, balance, component/move settings, sprites/poses, named forms, serialization, and history |

An equipped component is created once and receives its owner during attachment.
It can create inert per-use operations; each operation acquires its own scoped
resources when it starts. Components do not secretly equip other capabilities.
`ResourceLeases` provides exclusive controls and contact-policy overrides.
Component detach and operation cancellation release owned work and are designed
to be idempotent. `acquireIgnoredContact(runtimeId)` leases suppress both native
Matter response and gameplay dispatch for that pair; components choose the
policy, and the physics adapter applies it before Matter resolves impulses.

## Cleanup internals

Resource deduplication in [ScriptScope](../../src/engine/scripting/scope.ts)
uses weak references so closed scopes do not retain released resources.
Engine cleanup and event dispatch use `runAll` from
[cleanup.ts](../../src/engine/cleanup.ts) to finish every remaining action and
then propagate the first failure. Content authors should use the
[scopes and leases contract](../scripting/script-resources.md).

Related: [engine boundaries](engine-boundaries.md), [source map](source-map.md).

Read only the detail relevant to the change:

| Concern | Contract |
| --- | --- |
| Task admission, cooldowns, interruption, contacts | [Behavior runtime](behavior-runtime.md) |
| Tick order, registration, removal, ownership, match results | [Simulation lifecycle](simulation-lifecycle.md) |
| Detection geometry and enter/exit tracking | [Spatial queries](spatial-queries.md) |
| Definition, behavior, and config assembly | [Fighter authoring](../authoring/fighter-authoring.md) |
| Time, resources, composition, events, results | [Scripting reference index](../scripting/scripting-primitives.md) |
| Active roster and outstanding acceptance | [Migration checklist](../migration/fighter-migration-checklist.md) |
