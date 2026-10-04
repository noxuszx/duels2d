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

Baby Man is the working reference:

- [Definition](../src/content/fighters/babyman/definition.ts): component assembly
  and behavior-to-move bindings.
- [Behavior](../src/content/fighters/babyman/behavior.ts): wall contact, crawl,
  then dash toward a freshly selected enemy.
- [Configuration](../config/fighters/babyman.json): editable tuning and art.

Only Baby Man currently has an active blueprint. Other fighters are passive
opponents. Projectile emission is implemented but not equipped by the roster;
runtime form switching and the remaining fighter behaviors still need work.
