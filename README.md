# Duels2D — Bouncing Battle Simulator

## 🎯 Goal
Duels2D is a modular, zero-player 2D physics simulator designed specifically to be recorded for high-retention YouTube Shorts and TikToks. Characters (represented as bouncing entities) clash in a confined arena, exchange damage, and eventually use unique abilities. To maximize visual engagement, the arena is constrained to a mobile-friendly 9:16 aspect ratio, and the engine supports dynamic hit flashes, particle sparks, optional 2-pose weapons, and character-specific sound effects.

## 🏗️ Architecture & Design Principles

*   **Frontend**: Vanilla HTML & CSS.
*   **Game Logic & Render**: Vanilla JavaScript utilizing the HTML5 Canvas API.
*   **Physics Engine**: Matter.js (loaded via CDN) for pure elastic collisions (restitution: 1.0, zero friction).
*   **Audio**: Howler.js (planned) for seamless overlapping sound effects.

### Core Systems
1.  **Object-Oriented Modularity (`GameManager` & `Character`)**:
    *   `GameManager` handles the Matter.js Engine, World boundaries, the custom `requestAnimationFrame` render loop, and resolving collision events.
    *   `Character` acts as a wrapper around a Matter.js body, storing mutable state (health, hit flashes, timers).
2.  **Data-Driven Design (`CharacterConfigs`)**:
    *   New fighters are added by simply extending a JSON-like configuration array. Characters load their stats, sprites, and specific audio assets completely independent of the underlying physics logic.
3.  **Disconnected Hitboxes & Art**:
    *   The visual sprites are decoupled from the strict Matter.js collision radii. This allows characters to have large cosmetic features (auras, hair, weapons) that overlap naturally without falsely triggering damage calculations.
4.  **Custom Render Loop**:
    *   Matter.js's built-in debugger is bypassed. A highly customized HTML5 Canvas loop reads physics coordinates every frame and draws layered sprites, particle effects, and floating health bars perfectly synced to the action.

## 📂 Folder Tree

```text
Duels2D/
├── index.html            # Entry point, loads HUD, Canvas, and CDN scripts
├── style.css             # HUD styling and 9:16 constraints
├── game.js               # Core simulator logic (GameManager, Characters)
├── README.md             # Project documentation
├── PLAN.md               # Upcoming features and roadmap
└── assets/               # Local asset storage
    ├── audio/            # Generic/UI sound effects
    ├── images/           # Generic/UI images
    └── characters/       # Character-specific asset modules
        └── <character_id>/         
            ├── base.png
            ├── weapon_idle.png (optional)
            ├── weapon_attack.png (optional)
            └── clash.mp3
```
