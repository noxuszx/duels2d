# Project documentation

Duels2D runs generic physics bodies with sprites. Equipped components provide
capabilities; TypeScript behavior scripts decide when and how to use them.
These guides describe the current source, with implemented features separated
from planned work.

| Guide | Use it for |
| --- | --- |
| [Fighter architecture](fighter-architecture.md) | Ownership, simulation lifecycle, scripting contracts, and the source tree |
| [Fighter authoring](fighter-authoring.md) | Creating fighters, composing mechanics, and implementing reusable components |
| [Status effects](status-effects-architecture.md) | Applying and extending timed effects through shared combat |
| [Migration checklist](fighter-migration-checklist.md) | Current roster status, remaining work, and gameplay acceptance |
| [Configuration](../config/README.md) | Editable JSON, defaults, forms, assets, and validation |
| [Character Studio](../tools/character-studio/README.md) | Editor ownership, previews, serialization, and browser verification |

For gameplay work, read the architecture and authoring guides, then inspect the
actual component and fighter source you will use. For configuration or editor
changes, also read the configuration and Studio guides.

Baby Man and Granny are active blueprint examples:

- [Definition](../src/content/fighters/babyman/definition.ts): component assembly
  and behavior-to-move bindings.
- [Behavior](../src/content/fighters/babyman/behavior.ts): wall contact, crawl,
  then dash toward a freshly selected enemy.
- [Configuration](../config/fighters/babyman.json): editable tuning and art.
- [Granny definition](../src/content/fighters/granny/definition.ts): equipped
  components and configured moves.
- [Granny behavior](../src/content/fighters/granny/behavior.ts): ordered action
  checks, interruption, attack timing, aiming, and transformation decisions.
- [Granny configuration](../config/fighters/granny.json): base and transformed
  component, move, and pose settings.

Baby Man and Granny have active blueprints. Other roster entries remain passive
opponents. Granny exercises reusable melee, aimed projectile shots, and scripted
form entry; see the architecture and authoring guides for their contracts.
