# Engine and content boundaries

## Core philosophy

Fighters write content against engine tools; character-specific mechanics do
not belong in engine classes. The three layers are:

1. **Configuration** (`config/fighters/<id>.json`) contains stats, assets,
   tuning, move names, cooldowns, and form mappings. It has no execution logic.
2. **Components** (`src/gameplay/components/`) provide reusable, owner-bound
   capabilities and manage persistent lifecycle and cleanup. They do not hold
   character-specific sequences or effects.
3. **Behavior scripts** (`src/content/fighters/<id>/behavior.ts`) choose when
   and in what order to use capabilities, select targets, and compose effects.

When replacing an API, migrate its callers and remove the replaced implementation.
Do not keep compatibility layers, intermediate adapters, or duplicate code paths.

## Permission boundary

If a mechanic truly requires a new core component or engine modification,
explain why existing primitives cannot implement it, propose the exact design
and lifecycle, then get explicit user permission before changing the engine or
adding the component. Newly discovered engine capabilities require a proposal
and explicit approval.

Before proposing engine or component changes, check whether existing operations,
presentation leases, and content helpers can express the effect. Character
sequences and specific flourishes stay under `src/content/`; general resource
and timing primitives belong in the engine only with approval.

Related: [documentation index](../README.md).
