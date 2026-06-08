# Project Structure Plan

## Goal

Move Duels2D toward a cleaner layout without introducing a build system, ES modules, or a large refactor.

The project should continue to run as a simple static HTML page loaded through normal `<script>` and `<link>` tags.

## Recommended Intermediate Structure

Use this low-risk structure for the next organization pass:

```text
Duels2D/
├── index.html
├── README.md
├── PLAN.md
├── docs/
│   ├── command-line-feature-plan.md
│   └── project-structure-plan.md
├── assets/
│   ├── audio/
│   ├── characters/
│   │   ├── ember/
│   │   └── nova/
│   ├── images/
│   └── sfx/
├── config/
│   ├── game.js
│   └── characters.js
├── js/
│   ├── game.js
│   └── command-line.js
└── css/
    └── style.css
```

## Why This Structure

- Keeps the app static and browser-native.
- Separates source JavaScript from configuration.
- Keeps styling in a dedicated CSS directory.
- Gives the command line its own file immediately.
- Avoids a premature split into many systems before the game needs it.
- Keeps asset paths predictable.

## Migration Plan

### Step 1: Finish The Command-Line Feature

Implement the command-line feature first while keeping changes focused.

Expected files during implementation:

```text
index.html
style.css
game.js
command-line.js
docs/command-line-feature-plan.md
docs/project-structure-plan.md
```

This keeps the behavior work separate from the move-only cleanup.

### Step 2: Move Files

After the command-line feature is working:

- Move `game.js` to `js/game.js`.
- Move `command-line.js` to `js/command-line.js`.
- Move `style.css` to `css/style.css`.

Keep `config/game.js` and `config/characters.js` where they are for now.

### Step 3: Update HTML References

Update `index.html` paths:

```html
<link rel="stylesheet" href="css/style.css" />

<script src="config/game.js"></script>
<script src="config/characters.js"></script>
<script src="js/game.js"></script>
<script src="js/command-line.js"></script>
```

The command-line script should load after `game.js` so it can receive or locate the `GameManager` instance.

### Step 4: Verify Static Loading

Verify the game still runs from a local static server.

Check:

- Canvas renders.
- Character images load.
- Matter.js loads.
- Howler.js loads.
- Command line opens with `Ctrl + Space`.
- `pause`, `start`, `restart`, and `select` behave as expected.

## Current Non-Goals

Do not add these during the intermediate restructure:

- Bundler.
- Package manager.
- ES module conversion.
- Large renderer/physics/audio system split.
- TypeScript.
- Asset pipeline.

These may become useful later, but they are not needed for the current feature set.

## Future Structure Direction

If the game grows, a later structure can split systems more aggressively:

```text
src/
├── core/
├── systems/
├── ui/
├── config/
└── entities/
```

That should wait until the code has enough complexity to justify it.
