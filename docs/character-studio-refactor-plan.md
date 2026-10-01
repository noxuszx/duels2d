# Character Studio architecture and follow-up work

The Studio now groups modules by responsibility under `tools/character-studio/`. The previous extraction split files without separating the central application's state, drawing, controls, and persistence boundaries. This revision gives editor state a session owner and moves feature behavior into document, panel, tool, preview, asset, persistence, and UI folders.

See [the Studio README](../tools/character-studio/README.md) for folder responsibilities and dependency rules.

## Implemented boundaries

- `app/editor-session.ts` owns selection, tool drafts, restoration, and independent undo stacks for each fighter. `app/editor-history.ts` handles authored snapshots and redo branching.
- `document/` resolves forms and pose inheritance and normalizes documents at explicit loading/editing boundaries.
- `panels/` owns pose selection/dialogs, transformation editing, projectile and weapon properties, and targeted control edits. Changing one property does not materialize unrelated pose overrides.
- `tools/` groups each canvas interaction with its geometry. Crop and body hitbox changes stay in drafts until Apply; switching tools discards the abandoned draft. Geometry shared with the runtime stays in `src/rendering/`.
- `preview/` prepares a presentation copy and draws without modifying authored fields. Its projectile animation clock has explicit cleanup and avoids redrawing static projectiles.
- `assets/image-loader.ts` handles asynchronous body images and control ranges. Loading an image does not initialize an authored full-image crop; null crops render the full image.
- `persistence/` separates serialization, browser file access, and autosave. Saved content is captured before asynchronous access; writes are queued per handle and save failures surface through UI status.
- `ui/` owns DOM bindings and explicit control synchronization. Installing controls does not replace application methods.
- `styles/studio.css` imports contiguous layout, canvas, control, and workspace sections in their original order. The later workspace overrides remain separate to preserve the existing cascade.

## What remains coupled

`app/studio-app.ts` remains the composition facade and supplies structural host adapters. Feature modules no longer import the concrete application class, but panels and tools still receive mutable document access and imperative callbacks for drawing, labels, and history/save commits. Sharing editor types from `app/editor-types.ts` also remains an intentional dependency.

A future change can introduce explicit edit transactions and session subscriptions, letting views refresh from session notifications and reducing adapter callbacks. That work should follow concrete interaction needs rather than creating empty modules or rewriting all tools at once. The current folder structure does not imply that a full command/event architecture is finished.

## Verification

Run from the repository root:

```bash
npm run typecheck
npm run test -- tests/studio.test.ts tools/character-studio/tests
npm run build
node tools/validate-config.js
```

Focused regressions exercise session restoration and fighter history isolation, queued saves and failure recovery, pose inheritance, targeted edits, readonly drawing, image loading without authored crop changes, tool draft cancellation, and explicit control synchronization. Existing Studio integration tests remain in `tests/studio.test.ts`.

DOM smoke coverage uses mocked elements and canvas methods. It verifies wiring and state transitions, not browser appearance, image decoding, native pointer capture, or actual file-picker/write behavior. Manually check fighter/pose/form selection, crop and hitbox Apply/Cancel, aim dragging, undo/redo, JSON download, and File System Access API saving before shipping interaction changes.
