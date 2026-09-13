# Character Studio refactor plan

## Goal

Replace the monolithic Character Studio implementation with focused modules while preserving its browser behavior and editable fighter JSON format.

## Completed

- `main.ts` — loads fighter/runtime configuration and starts the Studio.
- `studio-types.ts` — Studio-only types.
- `studio-elements.ts` — typed DOM lookup and input helpers.
- `studio-controls.ts` — tabs, buttons, and numeric-input synchronization.
- `studio-renderer.ts` — canvas preview drawing.
- `studio-state.ts` — history snapshots and redo-branch handling.
- `fighter-file.ts` — fighter JSON synchronization, serialization, download, and file writes.
- `crop-tool.ts` — crop initialization, geometry, image loading, crop controls, and crop-mode actions.
- `hitbox-tool.ts` — hitbox drafts, geometry, controls, output parsing, and drag calculations through `HitboxToolHost`.
- `canvas-tool-controller.ts` — canvas coordinate conversion, mode routing, pointer capture, and drag lifecycle.
- `studio-app.ts` — the renamed coordinator, limited to wiring, selection, orchestration, and public control actions.
- Focused host interfaces now separate crop, hitbox, rendering, and fighter-file concerns from the coordinator.

## Remaining work

No planned extraction work remains. Future Studio changes should preserve these focused module boundaries.

## Verification after every slice

```bash
npm run typecheck
npm run build
node tools/validate-config.js
```

Also manually verify: selecting a fighter/pose, crop apply/cancel, hitbox apply/cancel, undo/redo, JSON download, and File System Access API saving.
