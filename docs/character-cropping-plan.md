# Character Cropping Plan

## Goal

Add non-destructive image cropping to Character Studio so character sprites can be visually adjusted without editing or overwriting the original PNG files.

The crop should become character metadata in `config/characters.js`, similar to `imageScale`, `imageOffset`, and `healthBarOffset`.

## Recommended Approach

Use Canvas 2D source-rectangle cropping through `drawImage()`.

Do not physically crop or rewrite PNGs in the first version. Store crop metadata and let both the game renderer and Character Studio render from that crop rectangle.

Example config:

```js
imageCrop: {
  x: 0,
  y: 0,
  width: 512,
  height: 512
}
```

Render with:

```js
ctx.drawImage(
  image,
  crop.x,
  crop.y,
  crop.width,
  crop.height,
  -drawR,
  -drawR,
  drawR * 2,
  drawR * 2
);
```

## Why This Fits Duels2D

- Keeps source assets intact.
- Keeps the project static and browser-native.
- Avoids introducing a backend, build step, or heavy editor library.
- Makes cropping reversible.
- Keeps character tuning centralized in `config/characters.js`.
- Lets cropping work consistently in both the arena and Character Studio.

## Industry Context

Common options for web image cropping:

- Canvas 2D API: best fit for lightweight local tools and custom renderers.
- Cropper.js: useful if drag handles and mature crop UI are needed quickly.
- Fabric.js or Konva: useful for full canvas editors, likely too heavy here.
- Pintura: polished commercial editor SDK, overkill for this project.
- Sharp/ImageMagick: backend asset pipelines, not needed for a static local tool.

For this project, use Canvas 2D directly first.

## Scope

### Phase 1: Body Sprite Cropping

Support cropping for the main character body image only:

```js
imageCrop: { x: 0, y: 0, width: 512, height: 512 }
```

### Later Phases

Add crop fields for weapon images only if needed:

```js
weaponIdleCrop: { x: 0, y: 0, width: 512, height: 512 },
weaponAttackCrop: { x: 0, y: 0, width: 512, height: 512 }
```

Scaling controls are intentionally out of scope for this plan. Existing `imageScale` remains the only scale control until a separate scaling phase.

## Data Model

Each crop rectangle should be stored in source-image pixel coordinates:

```js
{
  x: 24,
  y: 10,
  width: 420,
  height: 460
}
```

Rules:

- `x` and `y` are measured from the source image top-left.
- `width` and `height` are the source crop dimensions.
- Missing `imageCrop` means “use the full image”.
- Crop metadata should not affect hitboxes, collision, physics bounds, or health bar placement.

## Game Renderer Changes

### 1. Store Crop Metadata On Character

In `Character`, add:

```js
this.imageCrop = config.imageCrop ?? null;
```

### 2. Resolve Full-Image Default

Add a helper:

```js
_getImageCrop(image, crop) {
  return crop ?? {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}
```

### 3. Draw Body Sprite With Source Rectangle

Replace full-image draw calls for `char.sprite` with crop-aware drawing.

Current behavior:

```js
ctx.drawImage(char.sprite, -drawR, -drawR, drawR * 2, drawR * 2);
```

Target behavior:

```js
const crop = this._getImageCrop(char.sprite, char.imageCrop);
ctx.drawImage(
  char.sprite,
  crop.x,
  crop.y,
  crop.width,
  crop.height,
  -drawR,
  -drawR,
  drawR * 2,
  drawR * 2
);
```

## Character Studio Changes

### 1. Add Controls

Add four controls:

- `Image Crop X`
- `Image Crop Y`
- `Image Crop Width`
- `Image Crop Height`

Use range inputs for v1, matching the existing Studio interaction model.

### 2. Set Dynamic Ranges

Once the body image loads:

- `cropX.max = image.naturalWidth - 1`
- `cropY.max = image.naturalHeight - 1`
- `cropWidth.max = image.naturalWidth`
- `cropHeight.max = image.naturalHeight`

When `x` changes, clamp `width` so `x + width <= naturalWidth`.

When `y` changes, clamp `height` so `y + height <= naturalHeight`.

### 3. Normalize Missing Crop

When a character has no `imageCrop`, initialize it from the loaded image dimensions:

```js
imageCrop: {
  x: 0,
  y: 0,
  width: image.naturalWidth,
  height: image.naturalHeight
}
```

If the image is not loaded yet, use a temporary fallback and update it after load.

### 4. Include Crop In State

Update these methods:

- `_ensureConfigShape()`
- `_loadCurrentConfig()`
- `_snapshotCurrentState()`
- `_restoreState()`
- `_updateConfigFromInputs()`
- `_saveToLocalFile()`

The saved output should include `imageCrop`.

### 5. Draw Preview With Crop

Character Studio should draw the body image with the same `drawImage()` source-rectangle logic as the game.

This is important because the Studio is only useful if it previews exactly what the arena will render.

### 6. Add Crop Overlay

For v1, keep this simple:

- Draw the full source image faintly in a small crop reference area, or behind the crop preview.
- Draw a dashed rectangle representing `imageCrop`.
- Keep the final character preview centered as it currently is.

Do not add drag handles in the first pass unless the slider version feels too slow.

## Validation Rules

Crop values must be clamped before rendering and before saving:

```js
x >= 0
y >= 0
width >= 1
height >= 1
x + width <= image.naturalWidth
y + height <= image.naturalHeight
```

If invalid data exists in config, the Studio should repair it when loaded.

The game renderer should be defensive and fall back to the full image if crop data is invalid.

## Non-Goals

- No destructive image editing.
- No PNG overwrite/export in v1.
- No backend cropping.
- No Cropper.js unless Canvas-only controls prove insufficient.
- No weapon crop support in the first pass.
- No new scaling system in this phase.
- No hitbox changes.
- No physics behavior changes.

## Implementation Order

1. Add `imageCrop` support to `Character`.
2. Add crop-aware body drawing to the game renderer.
3. Add crop defaults and controls to Character Studio.
4. Add crop to Studio save, undo, and redo.
5. Add crop value clamping.
6. Add a simple crop overlay/reference preview.
7. Verify arena rendering and Studio preview match.

## Acceptance Criteria

- Existing characters render the same when `imageCrop` is missing.
- Adding `imageCrop` changes only the visible sprite crop.
- Hitboxes and wall bouncing are unchanged.
- Health bars are unchanged.
- Character Studio can tune crop values live.
- Character Studio saves `imageCrop` to `config/characters.js`.
- Undo and redo include crop changes.
- Invalid crop values are clamped or repaired.

