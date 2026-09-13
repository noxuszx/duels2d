# TypeScript migration handoff

## Status

The browser runtime and Character Studio have been migrated from global JavaScript classes to strict TypeScript ES modules powered by Vite. This was a behavior-preserving migration; it did not introduce Tauri or redesign gameplay.

Completed work:

- Added Vite, TypeScript, runtime Matter.js/Howler packages, and their type packages.
- Converted boot, engine, entities, systems, UI, and Character Studio to `.ts` modules.
- Added shared fighter, weapon, game, geometry, and compatibility contracts under `src/types/`.
- Separated editable `FighterDefinition` JSON from fully composed runtime `FighterConfig` objects.
- Replaced the fighter global-script loader and composer with typed modules under `src/config/`.
- Included the arena and Character Studio as Vite build entry points.
- Included Character Studio in strict type-checking.
- Kept fighter JSON, schemas, runtime configuration, and assets available in production builds.
- Preserved Matter.js `0.19.0` and fixed-timestep runner behavior.
- Removed the migrated JavaScript counterparts.

No migrated TypeScript file uses `any`, `@ts-ignore`, or `@ts-nocheck`.

## Development commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run preview
node tools/validate-config.js
node tools/generate-sound-manifest.js
```

Before committing application changes, run:

```bash
npm run typecheck
npm run build
node tools/validate-config.js
```

## Runtime configuration

Runtime configuration is editable JSON:

- `config/game-settings.json`
- `config/indicator-settings.json`
- `config/sound-manifest.json`

`src/config/runtime-config.ts` fetches and validates all three files before arena or Character Studio startup. The sound manifest is generated with `node tools/generate-sound-manifest.js`. Vite copies these JSON files and no longer processes legacy configuration scripts, so builds complete without legacy-script warnings.

The boot entry still installs temporary fighter and application references on `window` for compatibility. New code should prefer typed imports and constructor arguments instead of adding more globals.

The frontend is now in a clean state for a Tauri shell and native project/file-management commands.
