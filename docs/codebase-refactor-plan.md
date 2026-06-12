# Codebase Refactor Plan

This is a high-level plan for making the Duels2D codebase easier to navigate. The goal is not to rewrite the game. The goal is to make each folder and filename answer one clear question: "What kind of thing am I looking at?"

## Goals

- Reduce confusing repeated names like `character`, `characters`, `game`, and `sound`.
- Separate runtime code, configuration, assets, tools, and docs more clearly.
- Keep the browser-native script-tag setup unless there is a later explicit decision to add a build step.
- Make every refactor phase small enough for an AI agent to complete and verify safely.
- Preserve game behavior after each phase.

## Current Pain Points

- `js/` mixes entity classes, orchestration, UI, bootstrapping, and command input.
- `config/characters.js` sounds close to `js/character.js` and `assets/characters/`.
- `game.js`, `game-manager.js`, and `config/game.js` are easy to confuse.
- Character assets and character runtime code use the same word for different layers.
- Sound folders, manifest keys, and filenames do not yet have clearly separated roles.
- `game-manager.js` carries too many responsibilities, so it becomes the file people open for almost everything.

## Target Vocabulary

Use these words consistently:

```text
fighter     = playable combatant in the arena
roster      = config list of fighters
sprite      = visual image asset
sfx         = sound effect asset
manifest    = generated asset index
manager     = high-level orchestration
system      = focused gameplay behavior
tool        = developer-only utility
settings    = hand-authored config values
```

Avoid using `character` for new files unless referring to old code that has not been migrated yet.

## Target Folder Structure

```text
Duels2D/
├── index.html
├── src/
│   ├── boot/
│   │   └── start-game.js
│   ├── engine/
│   │   ├── game-manager.js
│   │   └── arena-renderer.js
│   ├── entities/
│   │   ├── fighter.js
│   │   └── projectile.js
│   ├── systems/
│   │   ├── audio-system.js
│   │   ├── collision-system.js
│   │   ├── weapon-system.js
│   │   └── indicator-system.js
│   └── ui/
│       ├── command-console.js
│       └── fighter-select-panel.js
├── config/
│   ├── game-settings.js
│   ├── fighter-roster.js
│   ├── indicator-settings.js
│   └── sound-manifest.js
├── assets/
│   ├── fighters/
│   │   └── <fighter-id>/
│   │       ├── sprites/
│   │       └── projectiles/
│   └── sfx/
│       ├── shared/
│       └── fighters/
├── tools/
│   ├── fighter-studio/
│   └── build-sound-manifest.js
├── docs/
│   ├── current-architecture.md
│   ├── codebase-refactor-plan.md
│   └── sound-asset-structure.md
└── graphify-out/
```

This structure is the destination. Do not try to get there in one commit.

## Phase 0: Baseline And Safety

Purpose: make sure every later move has a known-good baseline.

Tasks:

1. Run the game locally and record the current expected behavior.
2. Confirm the current script load order in `index.html`.
3. Run `node tools/generate-sound-manifest.js`.
4. Run `graphify query "What are the main runtime entry points and config files?"`.
5. Note any existing dirty files before editing.

Done when:

- The current game still starts.
- The manifest generator still runs.
- There is a clear list of files that should change in Phase 1.

## Phase 1: Documentation And Naming Map

Purpose: agree on names before moving files.

Tasks:

1. Update README with the target vocabulary.
2. Add or update a folder structure section that distinguishes `src/`, `config/`, `assets/`, `tools/`, and `docs/`.
3. Link to `docs/sound-asset-structure.md`.
4. Add a migration note that `character` names will gradually become `fighter` names.

Done when:

- A new contributor can tell which folder contains runtime code, config, assets, tools, and docs.
- No runtime behavior has changed.

## Phase 2: Config File Renames

Purpose: reduce confusion without touching gameplay logic.

Suggested renames:

```text
config/game.js        -> config/game-settings.js
config/characters.js  -> config/fighter-roster.js
config/indicators.js  -> config/indicator-settings.js
config/sounds.js      -> config/sound-manifest.js
```

Tasks:

1. Rename one config file at a time.
2. Update `index.html` script tags after each rename.
3. Keep exported globals stable at first, such as `window.GameConfig` and `window.CharacterConfigs`.
4. Run the game after each rename.

Done when:

- The config folder filenames describe what kind of config they contain.
- The browser still loads all scripts in the correct order.
- No runtime global has been renamed yet.

## Phase 3: Runtime Folder Split

Purpose: make `js/` less ambiguous by moving files into `src/`.

Suggested first pass:

```text
js/game.js              -> src/boot/start-game.js
js/game-manager.js      -> src/engine/game-manager.js
js/character.js         -> src/entities/fighter.js
js/projectile.js        -> src/entities/projectile.js
js/character-select.js  -> src/ui/fighter-select-panel.js
js/command-line.js      -> src/ui/command-console.js
```

Tasks:

1. Move files without changing internal class names first.
2. Update `index.html` script paths.
3. Verify load order after every move.
4. Only after paths are stable, consider renaming classes and globals.

Done when:

- Runtime code lives under `src/`.
- Folder names describe the role of each file.
- The game still starts and plays.

## Phase 4: Sound Asset Cleanup

Purpose: make audio assets searchable and reduce manifest confusion.

Use `docs/sound-asset-structure.md` as the source of truth.

Tasks:

1. Add `assets/sfx/shared/`.
2. Move shared sounds into `assets/sfx/shared/<sound-group>/`.
3. Rename numbered files to descriptive names with numeric suffixes.
4. Update `tools/generate-sound-manifest.js` to scan the new structure.
5. Prefer manifest entries shaped like `{ id, path }`.
6. Keep loader compatibility with old bare string entries during migration.

Done when:

- Searching for a sound by description works.
- The manifest remains generated, not hand-edited.
- Existing sound playback still works.

## Phase 5: Asset Folder Cleanup

Purpose: separate fighter visual assets from runtime/entity terminology.

Suggested target:

```text
assets/characters/       -> assets/fighters/
assets/fighters/<id>/    -> assets/fighters/<id>/sprites/
```

Tasks:

1. Move one fighter folder at a time.
2. Update `fighter-roster.js` image paths.
3. Keep projectile assets near their owning fighter unless they become shared.
4. Run the game after each fighter move.

Done when:

- Fighter media assets live under `assets/fighters/`.
- Config paths match the new asset layout.
- There are no empty old asset folders left.

## Phase 6: Split Large Runtime Responsibilities

Purpose: reduce the need to open `game-manager.js` for every gameplay question.

Candidate extractions:

```text
src/systems/audio-system.js
src/systems/collision-system.js
src/systems/weapon-system.js
src/systems/indicator-system.js
src/engine/arena-renderer.js
```

Recommended order:

1. Extract audio helpers first because they are relatively contained.
2. Extract indicator spawning and drawing next.
3. Extract weapon targeting and firing after that.
4. Extract collision handling last because it touches the most gameplay behavior.

Done when:

- `game-manager.js` reads more like orchestration than a catch-all file.
- Each system has a narrow responsibility.
- The public behavior is unchanged.

## Phase 7: Runtime Naming Cleanup

Purpose: align class and global names with the new vocabulary.

Potential renames:

```text
Character               -> Fighter
window.CharacterConfigs -> window.FighterRoster
CharacterSelectPanel    -> FighterSelectPanel
```

Tasks:

1. Rename one symbol at a time.
2. Keep temporary aliases if needed:

```js
window.CharacterConfigs = window.FighterRoster;
```

3. Remove aliases only after all references have moved.
4. Search with `rg "Character|character|characters"` after each rename.

Done when:

- New runtime names match the folder structure.
- Old vocabulary only appears where intentionally documented as legacy.

## Phase 8: Final Documentation And Graphify Update

Purpose: make the new structure navigable for humans and graphify.

Tasks:

1. Update `README.md`.
2. Update `docs/current-architecture.md`.
3. Run `node tools/build-sound-manifest.js` if the tool has been renamed.
4. Run `graphify update .`.
5. If doc semantic indexing is needed, run the full graphify update flow.

Done when:

- README, architecture docs, and folder names agree.
- Graphify reflects the new structure.
- Search results no longer show multiple competing naming systems.

## AI Agent Guardrails

Give the agent one phase at a time. Do not ask it to execute the whole plan at once.

Use prompts like:

```text
Execute Phase 2 only from docs/codebase-refactor-plan.md.
Rename config files one at a time, update script tags, and verify the app still loads.
Do not rename runtime globals yet.
```

```text
Execute Phase 3 only from docs/codebase-refactor-plan.md.
Move runtime files into src/ folders and update index.html.
Do not split game-manager.js yet.
```

```text
Execute Phase 6 audio extraction only.
Move audio pool creation and playback helpers out of the fighter class if that can be done without changing behavior.
Keep the public playSound(type) behavior working.
```

Require the agent to report:

- Files changed.
- Any runtime globals renamed.
- Any script load order changes.
- Verification commands run.
- Any behavior it could not verify.

## Verification Checklist

After each phase:

```bash
node tools/generate-sound-manifest.js
```

Open the game in a browser and verify:

- The canvas renders.
- Two fighters spawn.
- Fighters move and collide.
- Damage numbers appear.
- Weapon behavior still works.
- Sound still plays.
- Character/fighter selection still works.
- The command console still opens with `/`.

Then run:

```bash
graphify update .
```

Use search to catch stale names:

```bash
rg "config/game.js|config/characters.js|js/character.js|assets/characters"
rg "CharacterConfigs|CharacterSelectPanel|class Character"
```

## Recommended Stopping Points

Good stopping points are:

- After Phase 2, because config names are clearer but behavior is almost untouched.
- After Phase 3, because folder navigation is much better.
- After Phase 4, because sound search becomes useful.

Avoid starting Phase 6 unless you have time to test gameplay carefully.
