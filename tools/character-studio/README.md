# Character Studio

The Studio edits fighter JSON and previews the same sprite geometry used by the game. `main.ts` loads configuration and creates the application; `index.html` supplies the browser UI.

Default Facing describes the direction the original sprite image faces. Studio displays that image without mirroring; the game mirrors it when the fighter faces the opposite direction. Aim muzzle/pivot coordinates and forward angles belong to the original image. Melee hitbox X offsets are facing-relative: positive means forward, so a positive offset appears on the left for a native left-facing sprite.

The Aim tab selects either the body sprite or an independently aimed held weapon.
Aim coordinates are relative to the fighter center in its native facing. Base
settings live in `components.aim` and `components.weaponAim`; each named form has
its own component settings. Weapon image, scale, and attachment offset remain in
the Weapon controls.

The Forms tab creates and selects named forms, edits optional health ratio data,
and previews authored pose sequences. Runtime scripts can select configuration
with `Forms.enter()`; Granny's behavior explicitly checks her health threshold
and shows the sequence before entering her transformed form. Editor data alone
does not make a transformation run during a match.
Components and moves are editable as JSON in that tab; Apply validates known
component names and move timing, commits one undo entry, and saves the document.
The selected form's sprite and combat previews use its component and pose settings.

Arbitrary pose names can be used by gameplay scripts. Missing form poses inherit
base sprites in the preview. Projectile flight and other mechanic settings remain
editable through the Components JSON field; dedicated art controls still edit
projectile scale and rotation directly. Composed form maps replace supplied base
maps; omitted maps inherit, and explicitly empty maps survive serialization.
Studio's visual fallback preview does not implement runtime form switching.

## Folder responsibilities

| Folder | Responsibility |
| --- | --- |
| `app/` | Editor session, history snapshots, startup coordination, and event wiring. `studio-app.ts` provides structural host adapters to the feature modules. |
| `document/` | Fighter normalization, pose inheritance and overrides, and named form resolution. |
| `panels/` | Pose/dialog, forms, projectile, weapon, and property-control editing. |
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

## Saving project files

Run `npm run dev` and open `/tools/character-studio/`. Studio automatically
connects to the existing roster files in `config/fighters/index.json`. Committed
edits, including undo and redo, save directly to `config/fighters/<id>.json`.
Refresh reconnects automatically. Crop and hitbox drafts save when Apply is
clicked. Wait for the “Saved” status before closing; click Save to retry a failure.

The development server validates fighter JSON and its matching ID before
replacing an existing roster file using a completed temporary file. Saving
requires a same origin request and a session token. Studio writes do not reload
the editor.

Built sites and `npm run preview` use the browser Save dialog. Select the
original fighter JSON once per fighter per page session to enable autosave.
Browsers without that API download JSON for manual replacement. Direct project
saving requires `npm run dev`.

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

## Related guides

See [configuration](../../config/README.md) for JSON/defaults/forms and shared
validation, [architecture](../../docs/architecture/fighter-architecture.md) for runtime
ownership, and [fighter authoring](../../docs/authoring/fighter-authoring.md) for equipping
capabilities. Component data/editor controls can exist before their runtime
mechanic is implemented; check the [migration checklist](../../docs/migration/fighter-migration-checklist.md)
for current capability status.
