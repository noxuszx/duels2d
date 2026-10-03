# Character Studio

The Studio edits fighter JSON and previews the same sprite geometry used by the game. `main.ts` loads configuration and creates the application; `index.html` supplies the browser UI.

Default Facing describes the direction the original sprite image faces. Studio displays that image without mirroring; the game mirrors it when the fighter faces the opposite direction. Aim muzzle/pivot coordinates and forward angles belong to the original image. Attack hitbox X offsets are facing-relative: positive means forward, so a positive offset appears on the left for a native left-facing sprite.

The Aim tab selects either the body sprite or an independently aimed held weapon.
Weapon muzzle and aim pivot coordinates are relative to the fighter center in its
native facing; weapon offset positions the gun image center. Weapon aim uses
`skills.weaponAim`, with base/transformed form inheritance and no pose override.
Weapon image, scale, and attachment offset remain in the Weapon controls.

Skills are declared in fighter JSON. Top-level `skills` apply to the base form; `transformation.skills` override them after the transformation sequence finishes. Omitting that override inherits base skills, while `{}` disables them in the transformed form. Studio's existing form selector routes aim editing to the selected form.

Typed top-level `behavior` definitions and projectile `flight` policies are
preserved through serialization and undo/redo. Behavior settings are tuned in
JSON; the Studio does not add a panel for each behavior. Muscle Man's former
`combat.damageRamp` tuning now lives in `behavior.settings` with type `damage-ramp`.
Arbitrary pose names can be leased by gameplay scripts; missing transformed
pose keys inherit base poses, and transformation transition poses retain priority.

## Folder responsibilities

| Folder | Responsibility |
| --- | --- |
| `app/` | Editor session, history snapshots, startup coordination, and event wiring. `studio-app.ts` provides structural host adapters to the feature modules. |
| `document/` | Fighter normalization, pose inheritance and overrides, and base/transformed form resolution. |
| `panels/` | Pose/dialog, transformation, projectile, weapon, and property-control editing. |
| `tools/` | Crop, body hitbox, attack hitbox, and aim canvas interactions. Geometry sits beside each tool; the canvas controller routes pointer events. |
| `preview/` | Presentation defaults on a document copy, canvas drawing, and the disposable projectile animation clock. |
| `assets/` | Body image loading and the sprite catalog. Loading an image does not create an authored crop. |
| `persistence/` | Fighter serialization, browser file access/downloads, and ordered autosave writes with observable status. |
| `ui/` | Typed DOM lookup, element bindings, tabs, number/slider synchronization, and save-status display. |
| `styles/` | Ordered stylesheets for layout, canvas, controls, and later workspace overrides. |
| `tests/` | Focused session, serialization/save, pose, control-edit, preview, and tool regressions. Existing integration regressions also live in `tests/studio.test.ts` at the repository root. |

## Dependency boundaries

Feature modules describe the fields and callbacks they need through narrow host interfaces. Panels and tools do not import `CharacterStudio`; the application supplies the adapters. Shared types live in `app/editor-types.ts`, while game/runtime types and reusable sprite geometry remain in `src/`.

`EditorSession` owns selection, the active tool drafts, and independent fighter undo stacks. Panels and tools still mutate the editable document through host adapters and call the explicit save/history boundary after a committed edit. This is an incremental separation, not a complete command/event architecture.

Drawing resolves missing presentation fields on a copy and clamps only the crop used for rendering. Crop and body hitbox drafts remain separate from the document until Apply; Cancel restores the controls and discards the draft. Switching tools cancels the previous draft. Numeric controls and the mode badge synchronize explicitly, without replacing application methods at runtime.

Persistence receives serialized content captured before asynchronous file access. Autosave serializes writes per handle and publishes save/failure status. Browser file access remains separate from fighter serialization.

`styles/studio.css` imports `layout.css`, `canvas.css`, `controls.css`, and `workspace.css` in that order. The workspace stylesheet retains the existing later overrides. Keep this order to preserve the cascade.

## Verification

From the repository root:

```bash
npm run typecheck
npm run test -- tests/studio.test.ts tools/character-studio/tests
npm run build
node tools/validate-config.js
```

The automated tests cover editor state/history, save ordering and failure recovery, pose inheritance, targeted property changes, rendering without document mutation, draft transitions, and explicit control synchronization. DOM smoke tests use mocked elements and canvas methods; they cannot establish real browser layout, image decoding, pointer capture, or File System Access API behavior.

Before shipping interaction changes, check fighter/pose/form selection, crop and hitbox Apply/Cancel, aim dragging, undo/redo, JSON downloads, and file saving in a browser.
