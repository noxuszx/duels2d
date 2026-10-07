# Documentation index

Pages are grouped by purpose:

- `architecture/`: ownership, boundaries, runtime, simulation, spatial queries, and statuses.
- `scripting/`: operation APIs, events, resources, helpers, projectiles, and actors.
- `authoring/`: fighter setup, examples, forms, components, and verification.
- `migration/`: current migration work and historical checkpoints.

Start here and select the row matching the task. Read the linked page, then
inspect the relevant source. Follow related links only when the change needs
that contract; do not load every guide by default.

For gameplay changes, read [engine and content boundaries](architecture/engine-boundaries.md)
once. They define where mechanics belong and when engine/component changes
require user permission.

| Task | Read first | Read when needed |
| --- | --- | --- |
| Add a fighter or action | [Fighter authoring](authoring/fighter-authoring.md) | [Quick start](authoring/behavior-scripting-guide.md), [patterns](authoring/behavior-patterns.md) |
| Understand system ownership | [Architecture](architecture/fighter-architecture.md) | [Source map](architecture/source-map.md) |
| Diagnose admission, cooldowns, interruption, or contacts | [Behavior runtime](architecture/behavior-runtime.md) | [Statuses](architecture/status-effects-architecture.md) |
| Wait, tween, or account for partial ticks | [Timing](scripting/script-timing.md) | [Composition](scripting/script-composition.md) |
| Hold movement/aim resources or presentation leases | [Scopes and leases](scripting/script-resources.md) | [Content helpers](scripting/content-helpers.md) |
| Compose concurrent operations or generator branches | [Composition](scripting/script-composition.md) | [Results](scripting/script-results.md) |
| Subscribe to damage or commands; await an event | [Typed events](scripting/script-events.md) | [Results](scripting/script-results.md) |
| Return typed values or handle a race winner | [Operation results](scripting/script-results.md) | [Composition](scripting/script-composition.md) |
| Author shake, steering, condition waits, or repeated hits | [Content helpers](scripting/content-helpers.md) | [Spatial queries](architecture/spatial-queries.md) |
| Equip a projectile fighter | [Projectile assembly](authoring/projectile-authoring.md) | [Emission and lifecycle events](scripting/projectile-scripting.md) |
| React to projectile impacts, walls, or removal | [Projectile scripting](scripting/projectile-scripting.md) | [Typed events](scripting/script-events.md) |
| Spawn a trap, turret, summon, or actor | [Scripted actors](scripting/scripted-actors.md) | [Simulation lifecycle](architecture/simulation-lifecycle.md) |
| Change tick order, ownership, retirement, or match behavior | [Simulation lifecycle](architecture/simulation-lifecycle.md) | [Engine boundaries](architecture/engine-boundaries.md) |
| Query rays, areas, or overlap transitions | [Spatial queries](architecture/spatial-queries.md) | [Content helpers](scripting/content-helpers.md) |
| Apply or extend a status effect | [Status effects](architecture/status-effects-architecture.md) | [Shared combat source](../src/gameplay/combat/effects.ts) |
| Change entity config or named forms | [Entity configuration](architecture/entity-configuration.md) | [Forms](authoring/forms.md), [JSON configuration](../config/README.md) |
| Implement an approved reusable component | [Component authoring](authoring/component-authoring.md) | Relevant [scripting contracts](scripting/scripting-primitives.md) |
| Edit JSON, assets, defaults, or schema | [Configuration](../config/README.md) | [Character Studio](../tools/character-studio/README.md) |
| Change editor UI, previews, or serialization | [Character Studio](../tools/character-studio/README.md) | [Configuration](../config/README.md) |
| Validate a change | [Verification](authoring/verification.md) | [Current acceptance work](migration/fighter-migration-checklist.md) |
| Check active roster or remaining migration | [Migration checklist](migration/fighter-migration-checklist.md) | [Fighter examples](authoring/fighter-examples.md) |
| Evaluate a future capability | [Engine boundaries](architecture/engine-boundaries.md) | [Roadmap](scripting/scripting-roadmap.md) |
| Investigate an earlier verification checkpoint | [Migration history](migration/fighter-migration-history.md) | Current contract for the feature |

[Scripting primitives](scripting/scripting-primitives.md) is a compact API navigation index.
[Migration history](migration/fighter-migration-history.md) records past work and is not a
prerequisite for authoring. Keep contracts in their topic page and use links from
overviews and examples instead of duplicating the contract.
