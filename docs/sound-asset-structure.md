# Sound Asset Structure

This is the recommended structure for sound assets and manifest naming. The goal is to keep ownership, runtime intent, and searchable file identity separate.

## Folder Layout

```text
assets/
└── sfx/
    ├── shared/
    │   ├── body-bounce/
    │   │   ├── body-bounce-soft-01.mp3
    │   │   ├── body-bounce-hard-01.mp3
    │   │   └── body-bounce-wall-01.mp3
    │   ├── hurt/
    │   │   ├── hurt-light-01.mp3
    │   │   └── hurt-heavy-01.mp3
    │   └── victory/
    │       └── victory-sting-01.mp3
    └── characters/
        ├── happyguy/
        │   ├── ambient/
        │   │   ├── happyguy-laugh-short-01.mp3
        │   │   ├── happyguy-greeting-01.mp3
        │   │   └── happyguy-cheer-01.mp3
        │   └── weapon-slap/
        │       ├── happyguy-slap-windup-01.mp3
        │       └── happyguy-slap-impact-01.mp3
        └── depressedguy/
            ├── ambient/
            │   └── depressedguy-sigh-01.mp3
            └── weapon-fire/
                └── depressedguy-tear-fire-01.mp3
```

## Naming Rules

Use folders for ownership and sound categories:

```text
assets/sfx/shared/<sound-group>/<descriptive-file>.mp3
assets/sfx/characters/<character-id>/<sound-group>/<descriptive-file>.mp3
```

Use descriptive filenames:

```text
<character-or-shared-context>-<sound-description>-<variant-number>.<ext>
```

Examples:

```text
body-bounce-soft-01.mp3
hurt-heavy-02.mp3
happyguy-laugh-short-01.mp3
happyguy-slap-impact-01.mp3
depressedguy-tear-fire-01.mp3
```

Avoid filenames that are only numbers:

```text
01.mp3
02.mp3
03.mp3
```

Number suffixes are still useful, but only for variants of an already descriptive sound.

## Runtime Sound Groups

Prefer one canonical runtime key style. Use camelCase in JavaScript configs and manifests:

```text
bodyBounce    (migration note: currently emitted as "body-bounce" for backward compat)
hurt
death
ambient
attackWindup
attackActive
weaponFire
weaponHit
weaponSlap
victory
```

> **Migration note:** Shared sound keys (`body-bounce`, `hurt`, `victory`) are currently emitted as kebab-case by the manifest generator to match existing `playSound("body-bounce")` runtime calls. Fighter-specific keys (`weaponSlap`, `ambient`) already use camelCase. Once all runtime calls are normalized to camelCase, the manifest generator should convert shared keys too.

Folder names can stay kebab-case because they are paths:

```text
body-bounce/
attack-windup/
attack-active/
weapon-fire/
weapon-hit/
weapon-slap/
```

The manifest generator should convert kebab-case folder names to camelCase keys.

## Manifest Shape

Prefer searchable manifest entries instead of bare path strings:

```js
window.SoundManifest = {
  shared: {
    bodyBounce: [
      {
        id: "body-bounce-soft-01",
        path: "assets/sfx/shared/body-bounce/body-bounce-soft-01.mp3"
      }
    ],
    victory: [
      {
        id: "victory-sting-01",
        path: "assets/sfx/shared/victory/victory-sting-01.mp3"
      }
    ]
  },
  characters: {
    happyguy: {
      ambient: [
        {
          id: "happyguy-laugh-short-01",
          path: "assets/sfx/characters/happyguy/ambient/happyguy-laugh-short-01.mp3"
        }
      ],
      weaponSlap: [
        {
          id: "happyguy-slap-impact-01",
          path: "assets/sfx/characters/happyguy/weapon-slap/happyguy-slap-impact-01.mp3"
        }
      ]
    }
  }
};
```

This keeps runtime calls simple:

```js
character.playSound("weaponSlap");
```

And keeps search useful:

```text
rg "slap-impact"
rg "happyguy-laugh"
rg "body-bounce-soft"
```

## Migration Path

1. Add `assets/sfx/shared/` and move generic sounds there.
2. Rename numbered audio files to descriptive names with numeric suffixes.
3. Update the manifest generator to emit `{ id, path }` entries.
4. Keep loader compatibility with old string entries during migration.
5. Normalize config volume keys to the same camelCase runtime names.
6. Update README examples to point to `assets/sfx/characters/<character-id>/...`.
7. Run the sound manifest generator.
8. Run `graphify update .` so navigation reflects the new naming.
