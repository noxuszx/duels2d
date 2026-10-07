# Scripting reference index

Read [engine and content boundaries](../architecture/engine-boundaries.md) before proposing engine
or component changes. For behavior work, select only the relevant contracts below;
reading every page is unnecessary. Source exports define the implemented signatures.

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
