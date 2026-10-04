# Duels2D

Duels2D is a zero-player 2D fighting simulator that runs in the browser. Two
fighters bounce around a mobile-friendly 9:16 arena and use equipped mechanics
to fight until one team remains. It was built for recording
vertical video content.

Gameplay uses a headless 120 Hz Matter.js simulation, reusable components, and
TypeScript behavior scripts. Baby Man is currently the only active scripted
fighter; other roster entries are passive opponents awaiting behavior migration.

Start with the [documentation index](docs/README.md), then the
[architecture](docs/fighter-architecture.md) and
[fighter authoring guide](docs/fighter-authoring.md). Editable data and editor
work are covered by [configuration](config/README.md) and
[Character Studio](tools/character-studio/README.md).

---

## Installation

You need [Node.js](https://nodejs.org/) installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Then open the local URL printed in the terminal (usually
`http://localhost:5173`).

> Opening `index.html` directly as a file will not work — the app loads JSON
> and ES modules, so it must be served over HTTP.

### Other commands

| Command             | What it does                         |
|---------------------|--------------------------------------|
| `npm run build`     | Create a production build            |
| `npm run preview`   | Preview the production build locally |
| `npm run typecheck` | Check TypeScript types               |
| `npm run test`      | Run simulation and Studio tests      |
| `node tools/validate-config.js` | Validate fighter data and referenced assets |

---

## Basic Controls

* **`Space`** — pause / resume the simulation
* **`/`** — open the developer command console
* **`Escape`** — close the console
