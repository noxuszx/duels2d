# Fighter and component authoring

Read [the architecture](fighter-architecture.md) for ownership and lifecycle.
[Baby Man's definition](../src/content/fighters/babyman/definition.ts),
[behavior](../src/content/fighters/babyman/behavior.ts), and
[configuration](../config/fighters/babyman.json) show a movement sequence.
[Granny's definition](../src/content/fighters/granny/definition.ts),
[behavior](../src/content/fighters/granny/behavior.ts), and
[configuration](../config/fighters/granny.json) show attacks, aiming, and forms.

## Add a fighter

1. Create `config/fighters/<id>.json`, matching the filename to its unique ID.
   Add the file to `config/fighters/index.json` and assets under `assets/fighters/<id>/`.
2. Author stats, body/art, component settings, and named moves using the shared
   schema. Common values come from `defaults.json`.
3. Add `src/content/fighters/<id>/behavior.ts`, declaring the component-handle
   types it needs and returning generator handlers.
4. Add `definition.ts` with `defineFighter`: construct fresh components per owner,
   supply the behavior, and map every handler to a configured move ID.
5. Register the ready blueprint in `src/content/manifest.ts`. An entry without
   a blueprint uses the common preset as a passive opponent.

The definition equips capabilities; the behavior decides when to use them.
JSON alone does not attach components or execute moves. Runtime admission reads
`cooldownMs`; windup, recovery, range, and sound settings require explicit use
by a behavior/component. See [configuration](../config/README.md) for data details.

Baby Man's handler expresses the sequence directly:

```ts
*onWallContact({ wall }) {
  const target = targeting.nearestEnemy();
  if (!target) return;

  yield wallCrawl.start(wall, { toward: target });

  const nextTarget = targeting.nearestEnemy();
  if (nextTarget) yield dash.start(nextTarget);
}
```

The runtime owns admission/cooldown/cancellation. Components own movement, poses,
hits, and resource cleanup. Reselecting after crawl is the character's decision.

For several independent moves, return an `actions` map keyed by configured move
ID. Each entry supplies a `when` predicate and generator `run`; no event binding
is needed in `tasks` for these entries:

```ts
actions: {
  shoot: {
    when: () => !!targeting.nearestEnemy(),
    *run() {
      const target = targeting.nearestEnemy();
      if (target) yield gun.start(target);
    },
  },
}
```

The runtime checks declaration order and the active form's move map, admits one
ready action, and owns its cooldown. An entry with `interrupt: true` may replace
another task when its condition and admission checks pass; it cannot interrupt
itself. Granny uses this for transformation. A cancelled sequence stops; it is
not resumed automatically. Granny's still-true threshold permits a fresh attempt
after a status restriction ends, committing the form only after both timed poses.

## Compose an existing mechanic

Projectile emission is implemented. Granny is the roster example: its
definition equips targeting, aim, and an emitter, then its behavior chooses when
to fire. A new fighter could equip an emitter with targeting in `definition.ts`:

```ts
import { defineFighter } from "../../../gameplay/fighter-factory";
import { Targeting } from "../../../gameplay/components/targeting";
import { ProjectileEmitter } from "../../../gameplay/components/projectile";
import { shooterBehavior } from "./behavior";

export const shooter = defineFighter({
  id: "shooter",
  components: {
    targeting: context => new Targeting(context),
    gun: context => {
      const settings = context.config.components.projectile;
      if (!settings) throw new Error("Shooter requires projectile settings");
      return new ProjectileEmitter(context, settings);
    },
  },
  tasks: { onContact: "shoot" },
  behavior: shooterBehavior,
});
```

The companion `behavior.ts` names its typed handles:

```ts
import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Targeting } from "../../../gameplay/components/targeting";
import type { ProjectileEmitter } from "../../../gameplay/components/projectile";

interface ShooterComponents { targeting: Targeting; gun: ProjectileEmitter; }

export function shooterBehavior({ targeting, gun }: ShooterComponents): BehaviorHandlers {
  return {
    *onContact() {
      const target = targeting.nearestEnemy();
      if (target) yield gun.start(target);
    },
  };
}
```

This example requires `components.projectile` and `moves.shoot` in its JSON;
these names are configuration keys, while `gun` is the behavior's attached handle.
The schema and [settings types](../src/config/component-settings.ts) describe
projectile collision, lifetime, ownership, art, and recoil settings. Inspect
[flight](../src/gameplay/components/projectile/flight.ts) for their runtime semantics.

Yield `gun.start(target)` so the shot happens after admission. `spawn(target)`
is a lower-level immediate method and does not itself enforce move cooldowns.
For other decisions use the generic spawn/update/contact hooks documented in
[architecture](fighter-architecture.md). Gameplay waits use
`wait(durationMs)` from `src/engine/scripting/wait.ts` and simulation milliseconds.

## Implement a reusable component or action

Place mechanics under `src/gameplay/components/`. Implement the needed
`EntityComponent` hooks, accepting owner-bound `ComponentContext` and typed
settings. Expose focused methods for behaviors; leave choreography in the script.
A component may run independent background work in its tick hooks.

For a per-use action:

- Construct an inert `ScriptOperation`; acquire resources in `start(scope)`.
- Reject invalid targets/settings or unavailable exclusive resources before
  applying effects. Report `resource-conflict` when appropriate.
- Return exact consumed simulation time from `advance`, with explicit completion
  and timeout rules. Keep hit/contact history per use.
- Add temporary lease/subscription releases to the scope. Cancellation stops
  work without continuing the sequence; cleanup is idempotent.

Inspect [wall crawl](../src/gameplay/components/wall-crawl.ts),
[dash](../src/gameplay/components/dash.ts),
[operation](../src/engine/scripting/operation.ts), and
[scope](../src/engine/scripting/scope.ts) before implementing a mechanic.
Route hit effects through shared combat and pose/rotation through presentation
leases. Keep Matter manipulation inside mechanics/physics, out of behaviors.

For editable component settings, update `FighterComponents` in
`src/config/component-settings.ts` and the matching JSON Schema together.
The shared validator supports the schema vocabulary currently used; a new
unsupported keyword requires a validator change too. Studio's Components JSON
field handles schema-approved settings; add dedicated controls when useful.
New [statuses](status-effects-architecture.md) register their effect module and
use the existing combat/controller boundary.

## Spawned objects and forms

Spawned gameplay entities share `Entity` and the simulation registry. Allocate a
runtime ID, set team/owner and explicit target/contestant tags, choose lifetime
and owner/match removal policies, and clean up components on detach. Use
`simulation.add` / `simulation.remove`, not private world/body lists. Projectile
flight is the current working example. Additions inside a step become registered
at its final boundary; logical removal is immediate.

Named forms are editable data, and the `Forms` component provides explicit
selection for behavior scripts. Supplied `components`, `moves`, and `poses` maps
replace their base map, omitted maps inherit during composition, and `{}` is
explicitly empty. Component entries need full required settings. Form selection
updates active config data but does not install or remove component handles;
definitions equip those once and scripts decide which to use. Thresholds and pose
sequences do not execute by being present in JSON. For a working threshold and
transformation sequence, follow [Granny's behavior](../src/content/fighters/granny/behavior.ts).

## Verification

Use source/diff inspection and checks appropriate to the change. Commands are
listed in [the project README](../README.md). Meaningful coverage exercises
actual timing/contacts, rejected starts, cooldowns, interruption, death/removal/
reset/disposal, post-result continuation, and independent instances. Avoid tests
that copy implementation.
After editor/data changes, verify serialization, history, geometry preservation,
and empty-versus-inherited form maps.

Manually review gameplay, sprites, audio, and Studio interactions. Automated
checks do not establish image placement, pointer behavior, or actual browser
file saving. Record which checks ran and what still needs manual review.
