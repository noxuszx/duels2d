# Entity configuration and forms

## Authoring and data

`Entity<C>` uses common physical/visual configuration, with optional fields
normalized once at construction. `Entity<FighterConfig>` preserves fighter
metadata for typed assembly without adding a separate fighter class. Generic
mechanics use `ComponentContext` from `engine/component.ts`; fighter definitions
and forms use `FighterContext` from the factory. Targeting receives its facing
policy explicitly rather than assuming its owner is a fighter.

Configuration access is read-only. `setConfiguration()` normalizes replacement
settings and rejects changes to identity, hitbox/offset, radius, and maximum
health, since it does not rebuild physics or health state. Forms use that method;
equipped component handles still retain their explicitly supplied settings.

See [fighter authoring](../authoring/fighter-authoring.md) for definitions,
[component authoring](../authoring/component-authoring.md) for mechanics, and
[scripted actors](../scripting/scripted-actors.md) for spawned ownership. The
[configuration guide](../../config/README.md) describes editable data and validation;
the [Studio guide](../../tools/character-studio/README.md) describes editor ownership.

JSON configures capabilities but does not equip them. Definitions attach fresh
components for each owner. Move `cooldownMs` is used by runtime admission; other
move fields such as windup/recovery/range/sound require explicit behavior or
component use. There is no automatic phase sequence.

Supplied form `components`, `moves`, and `poses` maps replace their respective
base maps; omitted maps inherit during composition. An empty map is explicit.
The `Forms` component selects named config data when behavior calls `enter()`;
it does not install or remove component handles. Definitions equip stable handles
once, and scripts decide which to use. Granny's behavior owns its health
threshold, interruption, timed realization/rage poses, and eventual form entry.
No threshold or sequence runs automatically from JSON.

Related: [named forms](../authoring/forms.md), [configuration](../../config/README.md).
