# Equip a projectile fighter

## Compose an existing mechanic

Projectile emission is implemented. Granny is the roster example: its
definition equips targeting, aim, and an emitter, then its behavior chooses when
to fire. A new fighter could equip an emitter with targeting in `definition.ts`:

```ts
import { defineFighter } from "../../../gameplay/fighter-factory";
import { Targeting, ProjectileEmitter, SpriteAim } from "../../../gameplay/components";
import { shooterBehavior } from "./behavior";

export const shooter = defineFighter({
  id: "shooter",
  components: {
    targeting: context => new Targeting(context, context.config.faceTarget),
    gun: context => {
      const settings = context.config.components.projectile;
      if (!settings) throw new Error("Shooter requires projectile settings");
      return new ProjectileEmitter(context, settings);
    },
    aim: context => {
      const settings = context.config.components.aim;
      if (!settings) throw new Error("Shooter requires aim settings");
      return new SpriteAim(context, settings);
    },
  },
  tasks: { onContact: "shoot" },
  behavior: shooterBehavior,
});
```

The companion `behavior.ts` names its typed handles:

```ts
import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Targeting, ProjectileEmitter, SpriteAim } from "../../../gameplay/components";
import { scoped } from "../../../engine/scripting/scoped";

interface ShooterComponents { targeting: Targeting; gun: ProjectileEmitter; aim: SpriteAim; }

export function shooterBehavior({ targeting, gun, aim }: ShooterComponents): BehaviorHandlers {
  return {
    *onContact() {
      const target = targeting.nearestEnemy();
      if (!target) return;
      yield* scoped(() => aim.track(target), function* () {
        const solution = aim.current;
        if (solution) yield gun.emit({ position: solution.origin, direction: solution.direction });
      });
    },
  };
}
```

The example's JSON requires `components.projectile`, `components.aim`, and
`moves.shoot`; these are configuration keys, while `gun` and `aim` are the
behavior's attached handles. The emitter and aim settings configure independent
capabilities. The schema and [settings types](../../src/config/component-settings.ts)
describe projectile collision, lifetime, ownership, art, and recoil settings.
Inspect [flight](../../src/gameplay/components/combat/projectile/flight.ts) for runtime
semantics.
`aim.track(target)` is scoped to the operation sequence, and `aim.current` is
read at the firing point to obtain explicit muzzle position and direction.
`gun.spawn(group)` emits immediately and does not itself enforce move cooldowns.
Use content-level `burst(...)` for repeated emission.
For other decisions use the generic spawn/update/contact hooks documented in
[behavior runtime](../architecture/behavior-runtime.md). Gameplay waits use
`wait(durationMs)` from `src/engine/scripting/time/wait.ts` and simulation milliseconds.

Related: [projectile contracts](../scripting/projectile-scripting.md), [configuration](../../config/README.md).
