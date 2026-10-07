# Behavior scripting quick start

Behavior factories return `BehaviorHandlers`. Definitions equip typed component
handles and bind event handlers to configured move IDs. Named `actions` use their
configured move ID as the key.

```ts
import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { Targeting, Dash } from "../../../gameplay/components";

export function fighterBehavior(
  { targeting, dash }: { targeting: Targeting; dash: Dash },
  context: FighterContext,
): BehaviorHandlers {
  return {
    actions: {
      charge: {
        when: () => !!targeting.nearestEnemy(),
        *run() {
          const target = targeting.nearestEnemy();
          if (target) yield dash.start(target);
        },
      },
    },
  };
}
```

Keep `when()` a pure predicate. Reselect or validate targets when work starts.
Yield operations, delegate generator helpers with `yield*`, and use
`yield* perform(operation)` when a typed result is needed. One foreground task
owns admission and cooldown; cancellation closes its work.

Character sequences belong in `src/content/fighters/` or content helpers.
Scope temporary holds so interruption releases them. Keep Matter manipulation
in focused mechanics, physics code, or movement helpers. Read
[engine boundaries](../architecture/engine-boundaries.md) before proposing new capabilities.

| Need | Read |
| --- | --- |
| Create the definition, config, and move bindings | [Add a fighter](fighter-authoring.md) |
| Understand hooks, cooldowns, and interruption | [Behavior runtime](../architecture/behavior-runtime.md) |
| Copy an aimed-shot, melee, crawl/dash, form, or burst pattern | [Behavior patterns](behavior-patterns.md) |
| Select timing, resources, composition, or event APIs | [Scripting reference](../scripting/scripting-primitives.md) |
| Check the change | [Verification](verification.md) |
