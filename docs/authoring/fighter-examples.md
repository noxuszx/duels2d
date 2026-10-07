# Fighter source examples

Use these as navigation hints; source and configuration define current behavior.
For roster status and acceptance, see [migration work](../migration/fighter-migration-checklist.md).

| Example | Inspect it for |
| --- | --- |
| [Baby Man](../../src/content/fighters/babyman/behavior.ts) | Wall crawl, target reselection, then dash |
| [Granny](../../src/content/fighters/granny/behavior.ts) | Ordered actions, melee, aiming, interruption, and named forms |
| [Alien Man](../../src/content/fighters/alienman/behavior.ts) | Transformation and saucer creation |
| [Alien](../../src/content/fighters/alien/behavior.ts) | Thick-segment laser queries and explicit hit effects |
| [Angry Man](../../src/content/fighters/angryman/behavior.ts) | Scoped movement pause, concurrent windup/shake, bounded dash |
| [Depressed Man](../../src/content/fighters/depressedman/behavior.ts) | Projectile wall consumption and an end-event cluster burst |
| [Muscle Man](../../src/content/fighters/muscleman/behavior.ts) | Damage observation, stored charge, wall-event wait, return steering |
| [Saucer](../../src/content/actors/saucer/behavior.ts) | Static patrol alongside beams, typed deploy command, absolute spawn deadlines |

Definitions in each fighter's folder equip capabilities. Configurations in
`config/fighters/` supply tuning. The saucer uses `spawnActor` with
`matchEnd: "persist"`; its behavior remains in content rather than a saucer component.

Related: [behavior patterns](behavior-patterns.md), [source map](../architecture/source-map.md).
