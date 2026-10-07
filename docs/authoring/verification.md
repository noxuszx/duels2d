# Gameplay and documentation verification

## Verification

`tsconfig.test-types.json` compiles the event/cleanup tests and dedicated positive
and negative API checks in `tests/types/`. `npm run typecheck`, `npm test`, and
`npm run build` all run these checks, including tuple results, race narrowing,
required value results, nonempty races, and typed event payloads. Runtime Vitest
execution alone does not verify TypeScript assertions.

Use source/diff inspection and checks appropriate to the change. Commands are
listed in [the project README](../../README.md). Meaningful coverage exercises
actual timing/contacts, rejected starts, cooldowns, interruption, death/removal/
reset/disposal, post-result continuation, and independent instances. Avoid tests
that copy implementation.
After editor/data changes, verify serialization, history, geometry preservation,
and empty-versus-inherited form maps.

Manually review gameplay, sprites, audio, and Studio interactions. Automated
checks do not establish image placement, pointer behavior, or actual browser
file saving. Record which checks ran and what still needs manual review.

Related: [migration acceptance](../migration/fighter-migration-checklist.md).
