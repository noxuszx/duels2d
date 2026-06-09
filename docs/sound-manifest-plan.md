# Sound Manifest Plan

## Goal

Support character-specific sound effects without manually maintaining strict file names in character config.

The game should be able to play different sound categories per character, such as:

- `body-bounce`
- `weapon-hit`
- `hurt`
- `death`

Because this is a static browser game, the browser cannot scan folders at runtime. A local generator script will scan sound folders during development and write a static manifest file the browser can load.

## Core Constraint

Static browser JavaScript cannot list local project files:

```js
// Not available in a normal browser page:
listFiles("assets/characters/womanguy/sounds/body-bounce/");
```

So the project needs a dev-time manifest generator:

```bash
node tools/generate-sound-manifest.js
```

That script scans the repo and writes:

```text
config/sounds.js
```

The browser then loads `config/sounds.js` like any other config file.

## Recommended Asset Structure

Use one folder per character and one folder per sound type:

```text
assets/
└── characters/
    ├── womanguy/
    │   ├── womanguy.out.png
    │   └── sounds/
    │       ├── body-bounce/
    │       │   ├── 01.mp3
    │       │   ├── 02.wav
    │       │   └── heavy.ogg
    │       ├── weapon-hit/
    │       │   ├── 01.mp3
    │       │   └── metal.wav
    │       ├── hurt/
    │       │   └── 01.mp3
    │       └── death/
    │           └── 01.mp3
    └── chefguy/
        ├── chefguy.out.png
        └── sounds/
            ├── body-bounce/
            ├── weapon-hit/
            ├── hurt/
            └── death/
```

Shared sounds that every character can use once should live under `assets/sfx/` and be emitted into a top-level `shared` section in the manifest, instead of being duplicated under each character.

Filenames inside each sound-type folder do not need to follow a strict semantic naming pattern. The folder name defines the sound type.

## Required Asset Migration

The current character asset folders use placeholder/old names:

```text
assets/characters/nova/
assets/characters/ember/
```

These should be renamed during implementation to match actual character IDs:

```text
assets/characters/womanguy/
assets/characters/chefguy/
```

Update `config/characters.js` image paths at the same time:

```js
image: "assets/characters/womanguy/womanguy.out.png"
image: "assets/characters/chefguy/chefguy.out.png"
```

This avoids needing extra config fields like `assetId` or `soundSet`.

## Migration Order

Do this in a single change set or in this order:

1. Rename the character asset folders.
2. Update `config/characters.js` image paths to the new folders.
3. Add the generator script.
4. Generate `config/sounds.js` once, even if it is empty.
5. Update `index.html` to load `config/sounds.js`.
6. Switch `js/game.js` from global bounce audio to manifest-driven character audio.
7. Remove the old `bounceSounds` config only after the new path is working.

That ordering matters because each step keeps the site runnable after a refresh.

## Generated Manifest Shape

The generator writes:

```js
window.SoundManifest = {
  shared: {
    "body-bounce": [
      "assets/sfx/body-bounce/01.mp3"
    ]
  },
  characters: {
    womanguy: {
      "weapon-hit": [
        "assets/characters/womanguy/sounds/weapon-hit/01.mp3"
      ]
    },
    chefguy: {
      "body-bounce": [
        "assets/characters/chefguy/sounds/body-bounce/pan.wav"
      ]
    }
  }
};
```

If a sound-type folder is empty, that type can be omitted or emitted as an empty array. Omitting empty folders keeps the manifest smaller.

If a sound is universal, prefer putting it under `shared` once and letting characters fall back to it.

## Supported Audio Extensions

Start with:

```text
.mp3
.wav
.ogg
.m4a
```

Use lowercase extensions where possible.

## Generator Script

Create:

```text
tools/generate-sound-manifest.js
```

Responsibilities:

1. Read `assets/characters/`.
2. For each character folder, look for `sounds/`.
3. For each folder inside `sounds/`, treat the folder name as the sound type.
4. Collect supported audio files inside that sound-type folder.
5. Sort character IDs, sound types, and files for stable output.
6. Write `config/sounds.js`.

Pseudo-code:

```js
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHAR_DIR = path.join(ROOT, "assets", "characters");
const OUT_FILE = path.join(ROOT, "config", "sounds.js");
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

const manifest = { characters: {} };

for (const characterId of sortedDirectories(CHAR_DIR)) {
  const soundsDir = path.join(CHAR_DIR, characterId, "sounds");
  if (!fs.existsSync(soundsDir)) continue;

  const soundTypes = {};

  for (const soundType of sortedDirectories(soundsDir)) {
    const typeDir = path.join(soundsDir, soundType);
    const files = fs.readdirSync(typeDir)
      .filter(file => AUDIO_EXTS.has(path.extname(file).toLowerCase()))
      .sort()
      .map(file => `assets/characters/${characterId}/sounds/${soundType}/${file}`);

    if (files.length > 0) soundTypes[soundType] = files;
  }

  if (Object.keys(soundTypes).length > 0) {
    manifest.characters[characterId] = soundTypes;
  }
}

fs.writeFileSync(
  OUT_FILE,
  `window.SoundManifest = ${JSON.stringify(manifest, null, 2)};\n`,
);
```

Helper:

```js
function sortedDirectories(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}
```

## HTML Loading

Load the generated sound manifest before `js/game.js`.

Recommended script order:

```html
<script src="config/game.js"></script>
<script src="config/indicators.js"></script>
<script src="config/sounds.js"></script>
<script src="config/characters.js"></script>
<script src="js/game.js"></script>
```

If `config/sounds.js` does not exist yet, the browser will 404. Prefer committing a generated empty file:

```js
window.SoundManifest = { characters: {} };
```

During the migration, it is also acceptable to keep the old global bounce sounds in `config/game.js` as a temporary fallback until every character has at least one manifest entry. Once the manifest path is confirmed working, remove the fallback.

## Runtime Sound System

Move from global bounce sounds to per-character sound pools.

### Character Config

No sound paths are needed in `config/characters.js` if folder names match character IDs.

Character ID:

```js
id: "womanguy"
```

Sound manifest lookup:

```js
window.SoundManifest.characters.womanguy
```

If a character has no sound folder yet, `window.SoundManifest.characters[character.id]` should just be empty and the character should still render and fight normally.

If a type is missing from the character-specific pool, the runtime should fall back to `window.SoundManifest.shared[type]`.

### Character Class

Add:

```js
this.soundPools = this._createSoundPools();
this.soundCooldowns = {};
```

Create pools:

```js
_createSoundPools() {
  if (typeof Howl === "undefined") return {};

  const manifest = window.SoundManifest?.characters?.[this.id] ?? {};
  const pools = {};

  Object.entries(manifest).forEach(([type, paths]) => {
    pools[type] = paths.map(src => new Howl({
      src: [src],
      volume: this._volumeForSoundType(type),
    }));
  });

  return pools;
}
```

Volume helper:

```js
_volumeForSoundType(type) {
  const volumes = window.GameConfig.audio?.volumes ?? {};
  return volumes[type] ?? 0.65;
}
```

Playback method:

```js
playSound(type, cooldownMs = 80) {
  const pool = this.soundPools[type];
  if (!pool || pool.length === 0) return;

  const now = performance.now();
  const lastPlayed = this.soundCooldowns[type] ?? 0;
  if (now - lastPlayed < cooldownMs) return;

  this.soundCooldowns[type] = now;
  pool[Math.floor(Math.random() * pool.length)].play();
}
```

## Game Events

### Wall Bounce

When a character hits the arena wall:

```js
char.playSound("body-bounce");
```

Only the character that hit the wall should play.

### Character Collision

When two characters collide:

```js
charA.playSound("body-bounce");
charB.playSound("body-bounce");
```

This allows both characters to produce independent sounds.

### Future Weapon Hits

When weapon-specific attacks exist:

```js
attacker.playSound("weapon-hit");
defender.playSound("hurt");
```

### Death

On death:

```js
character.playSound("death", 0);
```

## Game Config

Replace global bounce sounds with sound settings:

```js
audio: {
  defaultCooldownMs: 80,
  volumes: {
    "body-bounce": 0.55,
    "weapon-hit": 0.7,
    "hurt": 0.8,
    "death": 0.9
  }
}
```

Avoid keeping hardcoded global `bounceSounds` once the manifest system is active.

## Workflow

1. Add or remove sound files in a character sound folder.
2. Run:

```bash
node tools/generate-sound-manifest.js
```

3. Refresh the browser.
4. Commit the shared sound files and updated `config/sounds.js`.

## Example Workflow

Add:

```text
assets/sfx/body-bounce/thud-heavy.mp3
assets/sfx/body-bounce/thud-light.wav
```

Run:

```bash
node tools/generate-sound-manifest.js
```

Generated:

```js
window.SoundManifest = {
  shared: {
    "body-bounce": [
      "assets/sfx/body-bounce/thud-heavy.mp3",
      "assets/sfx/body-bounce/thud-light.wav"
    ]
  },
  characters: {
    womanguy: {}
  }
};
```

## Non-Goals

- No runtime folder scanning in the browser.
- No backend server.
- No automatic regeneration while the browser is open.
- No strict filename naming convention.
- No sound editor UI yet.
- No per-frame sound playback.

## Pitfalls

- `config/sounds.js` can become stale if the generator is not run.
- Case-sensitive deploy targets may break paths if folder/file casing differs.
- Audio files with spaces can work but are easier to avoid.
- Browser autoplay policies can delay audio until user interaction.
- Too many simultaneous sounds can become noisy; use cooldowns.

## Acceptance Criteria

- Character folders are renamed from `nova` and `ember` to actual character IDs.
- Character image paths still work after folder rename.
- `tools/generate-sound-manifest.js` generates `config/sounds.js`.
- `index.html` loads `config/sounds.js`.
- Each character creates independent sound pools from `window.SoundManifest.characters[character.id]`.
- Wall bounce plays only the bouncing character sound.
- Character collision can play sounds for both characters independently.
- Adding new files to a sound-type folder only requires rerunning the generator.
