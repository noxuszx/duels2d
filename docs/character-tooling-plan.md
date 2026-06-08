# Character Tooling Plan

## Goal

Build a local-only Character Studio for authoring and tuning Duels2D fighters before they appear in the arena.

The tool should make it easy to preview a character in a `1:1` square canvas, tune its sprite scale and offsets, position optional weapon art, and manually place UI overlays like the health bar and name label.

This is a local development tool, not a public feature.

## Recommended Location

Keep tooling separate from the main game runtime:

```text
tools/
└── character-studio/
    ├── index.html
    ├── character-studio.css
    └── character-studio.js
```

This keeps `index.html`, `game.js`, and the arena experience focused on the game itself.

## Core Idea

The Character Studio should render a single character using the same visual rules as the game renderer.

It should show:

- Body image.
- Optional weapon image.
- Physics hitbox outline.
- Character center point.
- Health bar.
- Name label.
- Basic scale/offset reference guides.

The studio preview must be square so individual character composition can be checked in a `1:1` frame.

## Config Fields

The game already supports several visual fields:

```js
image
imageScale
imageOffset
weaponIdle
weaponAttack
weaponOffset
weaponScale
```

Add new optional fields for manual UI placement:

```js
hitbox: { type: 'box', width: 44, height: 88 }
healthBarOffset: { x: 0, y: -54 }
```

These should replace the current hardcoded health bar position that is derived only from radius.

## Example Character Config

```js
{
  id: 'nova',
  name: 'NOVA',
  maxHealth: 200,
  color: '#00d4ff',
  glowColor: 'rgba(0, 212, 255, 0.6)',
  radius: 30,
  hitbox: { type: 'box', width: 44, height: 88 },
  baseDamage: 18,
  speed: 10,

  image: 'assets/characters/nova/womanguy.out.png',
  imageScale: 2.2,
  imageOffset: { x: 0, y: 4 },

  weaponIdle: 'assets/characters/nova/weapon_idle.png',
  weaponAttack: 'assets/characters/nova/weapon_attack.png',
  weaponScale: 1.4,
  weaponOffset: { x: 28, y: -6 },

  healthBarOffset: { x: 0, y: -54 }
}
```

## Studio UI

### Layout

Use a two-panel layout:

- Left: square canvas preview.
- Right: control panel.

The control panel should expose sliders and number inputs for precise edits.

### Preview Canvas

The preview canvas should:

- Use a `1:1` aspect ratio.
- Render the character centered.
- Show transparent/square-safe character composition.
- Draw the hitbox outline as an overlay.
- Draw the health bar using the same offsets as the game.
- Draw weapon art if configured.

Suggested canvas size:

```text
512px by 512px
```

The internal preview can still scale responsively, but the coordinate system should stay stable.

### Controls

Minimum v1 controls:

- Character selector.
- Hitbox type.
- Hitbox width.
- Hitbox height.
- Hitbox radius.
- Body image path.
- Weapon idle image path.
- Weapon attack image path.
- Radius.
- Image scale.
- Image offset X.
- Image offset Y.
- Weapon scale.
- Weapon offset X.
- Weapon offset Y.
- Health bar offset X.
- Health bar offset Y.

Nice-to-have controls:

- Toggle hitbox overlay.
- Toggle center guide.
- Toggle health bar.
- Toggle weapon.
- Set current health preview percentage.

## Editing Model

### Version 1

Use sliders and number inputs.

This is enough to make the tool useful quickly and avoids complex canvas pointer logic at the start.

### Version 2

Add drag handles directly on the canvas.

Draggable elements:

- Body image.
- Weapon image.
- Health bar.

This will make offset tuning faster, especially for placing the health bar above faces and positioning weapons naturally.

## Saving Strategy

### Native Browser File System Access API

Instead of a copy/paste approach or a local Python backend, the studio uses the modern **File System Access API**.

Responsibility:
- The user selects their local `config/characters.js` file via a native browser prompt.
- The browser grants the studio direct write access to this file.
- Any slider changes or undo/redo actions instantly write the JSON string directly to the local hard drive.

This keeps the tooling 100% static while still providing automated local saving. (Requires Chromium-based browser like Chrome, Edge, or Vivaldi).

## Integration With Game Renderer

Before building the studio, update the game renderer to support:

- `healthBarOffset`
- `nameOffset`

The studio should match the game draw math as closely as practical.

Recommended approach:

- Keep the first studio renderer simple but intentionally parallel to the game renderer.
- Avoid extracting shared renderer code until duplication becomes painful.
- Once the drawing rules stabilize, consider moving character drawing into a shared helper used by both game and studio.

## Implementation Phases

### Phase 1: Config And Game Renderer Support (DONE)

- Add `healthBarOffset` support to character configs.
- Update game rendering to use those offsets.
- Keep defaults matching current behavior.
- (Updated) Remove character name labels entirely. Matchup is shown in the HUD instead.

Done when:

- Existing characters look the same without new config values.
- Characters can manually move health bars through config.

### Phase 2: Static Studio Page (DONE)

- Create `tools/character-studio/index.html`.
- Create `tools/character-studio/character-studio.css`.
- Create `tools/character-studio/character-studio.js`.
- Render a square preview canvas.
- Load `config/game.js` and `config/characters.js`.

Done when:

- The studio page can select and render an existing character.

### Phase 3: Live Controls (DONE)

- Add sliders and number inputs.
- Update the preview in real time.
- Support body, weapon, and health bar tuning.
- Add Undo/Redo tracking.

Done when:

- The user can tune all important visual placement fields without editing code.

### Phase 4: Local File Access Save (DONE)

- Add `Link config/characters.js` button.
- Use `window.showOpenFilePicker()` to get a file handle.
- Auto-save config data directly to the local JS file on every change.

Done when:

- The studio can persist changes directly to the filesystem without manual copy/paste.

### Phase 5: Canvas Drag Handles (TODO)

- Add direct manipulation for offsets.
- Dragging a visible element updates its matching offset fields.

Done when:

- Health bar, weapon, and body placement can be adjusted visually.

## Current Non-Goals

Do not add these in the first pass:

- Public-facing editor.
- User accounts.
- Cloud storage.
- Full animation editor.
- Sprite packing.
- Build system.
- Direct file writing from static browser code.

## Open Design Notes

- Character art should be authored as square-friendly images where possible.
- The physics hitbox should remain separate from sprite size.
- Health bar and name placement should be treated as per-character visual metadata.
- Weapon placement should be optional and should not affect the hitbox unless a future gameplay system explicitly needs weapon hitboxes.
