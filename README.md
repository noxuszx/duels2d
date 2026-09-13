# Duels2D

Duels2D is a zero-player 2D fighting simulator that runs in the browser. Two
fighters bounce around a mobile-friendly 9:16 arena, deal damage on impact, and
use their own weapons until one is left standing. It was built for recording
vertical video content.

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

---

## Basic Controls

* **`Space`** — pause / resume the simulation
* **`/`** — open the developer command console
* **`Escape`** — close the console
