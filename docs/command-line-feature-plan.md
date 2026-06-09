# Command Line Feature Plan

## Goal

Add an in-game command line that opens with `Ctrl + Space` and lets the user control the simulator without adding permanent buttons to the main UI.

The first version should support commands for game flow:

- `start`
- `pause`
- `restart`
- `select`

The command line will also become the entry point for character selection later.

## User Experience

### Trigger

- Pressing `Ctrl + Space` toggles the command line.
- If the command line is closed, `Ctrl + Space` opens it and focuses the input.
- If the command line is open, `Ctrl + Space` closes it.
- Pressing `Escape` closes the command line.
- Pressing `Enter` executes the current command.
- When the game is paused, pressing `Space` unpauses the game.
- `Space` should not unpause while the command input is focused.

### Visual Design

The command line should be intentionally simple:

- A black rectangle positioned at the top of the viewport.
- Long enough to feel like a command bar, ideally near full width but constrained so it does not overflow on mobile.
- A `>` prompt icon at the start of the input row.
- A single text input after the prompt.
- Example appearance:

```text
> start
```

Suggested first-pass layout:

- Position: fixed or absolute at the top center.
- Width: `min(920px, calc(100vw - 24px))`.
- Height: around `44px` to `56px`.
- Background: black.
- Text: white or light gray.
- Prompt color: muted white or accent yellow.
- Border: optional subtle gray line.
- Z-index above canvas and winner screen.

### Interaction Behavior

- Opening the command line should not accidentally trigger game actions.
- While typing in the command line, game keyboard shortcuts should be ignored.
- Empty input on `Enter` should do nothing.
- Unknown commands should show a short inline error or status message.
- After a successful command, the command line can close automatically unless the command opens a sub-UI.

Recommended behavior:

- `start`: execute, close command line.
- `pause`: execute, close command line.
- `restart`: execute, close command line.
- `select`: keep command line open or transition into character selection UI.

## Command Set

### `start`

Starts or resumes the simulation.

Expected behavior:

- The game still auto-starts on page load.
- If character selection has been used, start the selected matchup.
- If the game was restarted into a waiting/paused state, begin or resume that match.
- If the game is paused, resume it.
- If the game is already running, do nothing or show `Already running`.
- If the match is over, show `Use restart to begin a new match`.

Recommended MVP behavior:

- Resume from paused state.
- Start the currently selected matchup once character selection exists.
- If game is over, show `Use restart to begin a new match`.

### `pause`

Pauses the simulation.

Expected behavior:

- Stop physics updates.
- Freeze gameplay timers, particles, hit flashes, and physics.
- Continue rendering the same frozen frame so UI remains responsive.
- Do not clear game state.
- Allow `Space` to unpause when command input is not focused.

Implementation note:

- This likely requires introducing a dedicated `paused` boolean in `GameManager`.
- The render loop can keep drawing, but physics updates and gameplay timers should stop when paused.

### `restart`

Restarts the current match with the currently selected characters.

Expected behavior:

- Hide the winner screen if visible.
- Clear particles.
- Remove existing character bodies.
- Respawn selected characters.
- Reset health, timers, and game-over state.
- Resume the simulation.

This can call the existing restart flow, but it may need to become public or command-safe.

### `select`

Opens character selection.

Expected MVP behavior:

- Show a placeholder selection panel or status message.
- Do not implement final selection UI yet.

Future expected behavior:

- Open a character selection overlay.
- Let the user choose player 1 and player 2 from `CharacterConfigs`.
- Store selected character IDs in game state.
- Restart or start a match using those selected characters.

## Architecture

### New UI Layer

Add a small command-line UI layer separate from game physics.

Possible structure:

```text
index.html
  #command-line
    .command-prompt >
    input#command-input
    #command-status
```

The command line should be hidden by default with a class such as `.hidden`.

### Command Controller

Create a lightweight controller responsible for:

- Toggling the command line.
- Focusing and clearing the input.
- Listening for `keydown` events.
- Parsing command text.
- Dispatching commands to game methods.
- Showing command errors/status.

Possible class:

```js
class CommandLineController {
  constructor(gameManager) {}
  toggle() {}
  open() {}
  close() {}
  execute(rawInput) {}
}
```

This keeps command parsing out of `GameManager`.

### File Split

Split the command UI JavaScript out from `game.js`, but do the broader folder move after the command-line feature is working.

During initial implementation, create:

```text
command-line.js
```

Responsibilities:

- Own command-line DOM references.
- Own command-line keyboard handling.
- Own command parsing and dispatch.
- Call public `GameManager` methods.

This keeps `game.js` focused on simulation state, physics, rendering, and public game actions. The project is still small, but the command line is a separate UI/control surface and will grow once character selection is added.

After the feature is complete and verified, apply the low-risk project structure split described in `docs/project-structure-plan.md`.

### GameManager Public API

Expose a small public API for commands instead of letting the command controller call private methods directly.

Potential methods:

```js
game.start()
game.pause()
game.restart()
game.openCharacterSelect()
```

Internally, these can call existing private methods where appropriate.

Recommended distinction:

- Public methods represent user actions.
- Private methods continue to handle implementation details like spawning characters, rebuilding walls, and rendering.
- Keep runtime state minimal; avoid adding flags like `started` or direct selection arrays unless they are read by gameplay logic.

### Game State

The command feature should rely on the existing `paused` and `gameOver` state in `GameManager`.
Avoid adding unused selection arrays or extra status flags unless gameplay logic reads them.

## Command Parsing

Keep parsing simple for the first version.

Rules:

- Trim whitespace.
- Convert command name to lowercase.
- Split by whitespace.
- First token is command name.
- Remaining tokens are args.

Examples:

```text
start
pause
restart
select
select nova ember
```

The MVP only needs bare commands. Argument support can be added now as a parser shape but left unused until character selection is implemented.

Suggested dispatch shape:

```js
const commands = {
  start: () => game.start(),
  pause: () => game.pause(),
  restart: () => game.restart(),
  select: () => game.openCharacterSelect(),
};
```

## Character Selection Direction

The `select` command should be designed as the future entry point for choosing fighters.

Two likely future modes:

### Overlay Mode

`> select` opens a visual character picker.

Pros:

- Better for browsing character art.
- Easier to support mobile.
- Clearer for users who do not know character IDs.

### Direct Command Mode

`> select nova ember` immediately selects the two fighters.

Pros:

- Fast for development/testing.
- Easy to script.
- Fits the command-line concept.

Recommended long-term approach:

- Support both.
- `select` opens the UI.
- `select nova ember` directly sets the matchup.

## Implementation Phases

### Phase 1: Static Command UI

- Add command-line markup to `index.html`.
- Add command-line styles to `style.css`.
- Add `command-line.js` and load it after `game.js`.
- Hide it by default.
- Add the `>` prompt and input field.

Done when:

- `Ctrl + Space` opens a black command bar at the top.
- The input receives focus.
- `Escape` closes it.

### Phase 2: Command Controller

- Add a `CommandLineController` class or equivalent module.
- Wire keyboard handling.
- Parse and execute basic commands.
- Show a short status for unknown commands.

Done when:

- `> restart` restarts the game.
- Unknown commands produce a visible message.

### Phase 3: Game Flow API

- Add public `start`, `pause`, and `restart` methods to `GameManager`.
- Keep private methods private where possible.
- Add a `paused` state.
- Ensure pause stops gameplay progression.

Done when:

- `> pause` freezes the match.
- `> start` resumes the match.
- `> restart` resets the current matchup.

### Phase 4: Selection Placeholder

- Add `openCharacterSelect()` as a public method.
- For now, show a placeholder UI or command status like `Character selection coming soon`.
- Keep this method as the integration point for the future picker.

Done when:

- `> select` routes through the correct method without changing game state unexpectedly.

### Phase 5: Real Character Selection

- Build a character selection overlay.
- Read available characters from `window.CharacterConfigs`.
- Store selected character IDs.
- Update spawn logic to use selected characters instead of `slice(0, 2)`.
- Optionally support `select nova ember`.

Done when:

- The user can choose both fighters.
- Restart/start uses the chosen fighters.

## Risks And Decisions

### Pause Semantics

Decision:

- Freeze physics and gameplay timers.
- Freeze particles and hit flashes.
- Continue rendering the same frame so the UI stays responsive.
- `Space` unpauses the game when command input is not focused.

### Start Semantics

Decision:

- Keep current auto-start behavior.
- Make `start` resume from pause.
- Once character selection exists, make `start` begin the currently selected matchup.
- After `restart`, `start` can resume/begin the reset matchup if restart leaves the game paused or waiting.

### Command Line On Mobile

Mobile support is intentionally out of scope for now.

Decision:

- Do not add mobile-specific controls.
- Do not add alternate touch triggers.
- Keep `Ctrl + Space` as the command-line shortcut.

### Browser Shortcut Conflicts

Some browsers or OS-level input methods may intercept `Ctrl + Space`.

Mitigation:

- Use `event.preventDefault()` when detecting the shortcut.
- Consider an alternate shortcut later if needed.

## Recommended File Changes Later

Expected implementation touch points:

```text
index.html
style.css
game.js
command-line.js
docs/command-line-feature-plan.md
docs/project-structure-plan.md
```

After the command-line feature is complete and verified, follow `docs/project-structure-plan.md` to move files into the intermediate structure:

```text
css/style.css
js/game.js
js/command-line.js
```

The command controller should live in `command-line.js` from the first implementation. `game.js` should expose public game actions, while `command-line.js` should handle UI, parsing, shortcuts, and dispatch. Once that behavior is stable, perform the folder split using the details in `docs/project-structure-plan.md`.
