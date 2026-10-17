# Scripting reference index

Read [engine and content boundaries](../architecture/engine-boundaries.md) before proposing engine
or component changes. For behavior work, select only the relevant contracts below;
reading every page is unnecessary. Source exports define the implemented signatures.

## Capability lookup

Choose an existing tool, inspect its source and the closest example, then read
the relevant contract below. Components are equipped in the fighter definition;
helpers compose those capabilities in content. The source links are export
indexes unless a specific implementation is linked.

| Need | Existing tool / source | Example |
| --- | --- | --- |
| Select a target, dash, crawl, or strike | `Targeting`, `Dash`, `WallCrawl`, `MeleeAttack` in [components](../../src/gameplay/components/index.ts) | [Baby Man](../../src/content/fighters/babyman/behavior.ts) |
| Steer a dynamic fighter or move a static actor | `steer`, `moveTo` in [content helpers](../../src/content/script-helpers/index.ts) | [Muscle Man](../../src/content/fighters/muscleman/behavior.ts), [saucer](../../src/content/actors/saucer/behavior.ts) |
| Pause movement, shake, or play pose steps | `pauseMovement`, `shake`, `poseSequence` in [content helpers](../../src/content/script-helpers/index.ts) | [Angry Man](../../src/content/fighters/angryman/behavior.ts) |
| Aim, emit projectiles, or fire a burst | `SpriteAim`, `ProjectileEmitter` in [components](../../src/gameplay/components/index.ts); `burst` in [helpers](../../src/content/script-helpers/index.ts) | [Granny](../../src/content/fighters/granny/behavior.ts), [burst pattern](../authoring/behavior-patterns.md#pattern-e-multi-shot-projectile-burst) |
| Switch a named form | `Forms` in [components](../../src/gameplay/components/index.ts) | [Granny](../../src/content/fighters/granny/behavior.ts) |
| Wait, animate, run branches, or receive a result | `wait`, `during`, `tween`, `all`, `race`, `sequence`, `perform` in [scripting](../../src/engine/scripting/index.ts) | [Saucer](../../src/content/actors/saucer/behavior.ts) |
| Release temporary controls on interruption | `scoped` and scope cleanup in [scripting](../../src/engine/scripting/index.ts) | [Angry Man](../../src/content/fighters/angryman/behavior.ts) |
| Observe damage, await an event, or stop on a condition | `entity.events`, [waitForEvent](../../src/engine/scripting/events/wait-for-event.ts), [until](../../src/content/script-helpers/flow/until.ts) | [Muscle Man](../../src/content/fighters/muscleman/behavior.ts) |
| React to projectile walls or removal | Projectile lifecycle events; [event helpers](../../src/content/script-helpers/combat/projectile-events.ts) | [Depressed Man](../../src/content/fighters/depressedman/behavior.ts) |
| Query a ray/area or apply explicit hits | [Spatial queries](../architecture/spatial-queries.md), [raySegment / hitEnemies](../../src/content/script-helpers/combat/query-hit.ts) | [Alien](../../src/content/fighters/alien/behavior.ts) |
| Spawn an independently scripted actor | [spawnActor](../../src/gameplay/actor-factory.ts) | [Alien Man](../../src/content/fighters/alienman/behavior.ts) |

## Contracts by task

| Task | Read |
| --- | --- |
| Wait, animate, or account for partial ticks | [Timing](script-timing.md) |
| Hold resources or offset/rotate presentation | [Scopes and leases](script-resources.md) |
| Run branches together or interrupt a sequence | [Composition](script-composition.md) |
| Subscribe to damage, commands, or await an event | [Typed events](script-events.md) |
| Receive values from operations, sequences, or races | [Operation results](script-results.md) |
| Author movement, shake, condition waits, or spatial-hit helpers | [Content helpers](content-helpers.md) |
| Emit projectiles or react to impact, wall, and end | [Projectile scripting](projectile-scripting.md) |
| Spawn a trap, summon, or independently scripted actor | [Scripted actors](scripted-actors.md) |
| Evaluate a new engine capability | [Boundaries](../architecture/engine-boundaries.md), then [roadmap](scripting-roadmap.md) |

For action admission and contacts, see [behavior runtime](../architecture/behavior-runtime.md).
For test commands and coverage, see [verification](../authoring/verification.md).
