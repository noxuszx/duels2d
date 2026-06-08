# Duels2D Implementation Plan

This document outlines the step-by-step plan for bringing the MVP to the next level based on recent architectural discussions.

## 1. Container & Aspect Ratio (YT Shorts/TikTok Ready)
**Goal:** Lock the simulator to a `9:16` aspect ratio instead of letting it fill arbitrary wide screens.
*   **CSS Update:** Add a `.game-container` with `max-width: 1080px` and `aspect-ratio: 9/16`, centered on the screen.
*   **Game.js Update:** Update `_resizeCanvas()` and `_rebuildWalls()` in the `GameManager` to build the Matter.js physics walls around this new container's dimensions rather than `window.innerWidth/innerHeight`.

## 2. Decoupling Hitboxes & Image Rendering
**Goal:** Allow artwork to be larger or smaller than the physical Matter.js bouncing body.
*   **Game.js Update:** Add `image`, `imageScale`, and `imageOffset` to `CharacterConfigs`.
*   **Render Loop:** In `_drawCharacters()`, swap the generic `arc` and `fill` commands with `ctx.drawImage()`. Save the canvas state, translate to the body's coordinates, rotate by the body's angle, and draw the image scaled according to the `imageScale` property.

## 3. Integrating Character-Specific Audio (Howler.js)
**Goal:** Prevent audio clipping and map clash sounds to the specific characters involved.
*   **HTML Update:** Add the Howler.js CDN link to `index.html`.
*   **Character Update:** Preload `Howl` instances inside the `Character` constructor using `sfxClash` from the configuration.
*   **Collision Hook:** In `_registerCollisionEvents()`, upon a successful hit, play the character's unique clash sound.

## 4. Optional 2-Pose Weapons
**Goal:** Give characters the visual punch of attacking without needing skeletal animation.
*   **Config Addition:** Check for optional `weaponIdle` and `weaponAttack` keys in `CharacterConfigs`.
*   **Render Logic:** During the render loop, if a weapon exists, draw the `weaponIdle` image overlaying the base character. If the character's `hitFlashTimer` or a new `attackTimer` is active, swap to `weaponAttack` momentarily. The physics body rotation will naturally swing the weapon.

## 5. Next Steps
Once the above core systems are implemented:
*   [ ] Add placeholder PNGs to `assets/characters/nova/` and `assets/characters/ember/`.
*   [ ] Add placeholder MP3s to test overlapping Howler.js audio.
*   [ ] Test edge cases (e.g., characters getting stuck in corners).
*   [ ] Begin designing unique, scriptable "Abilities" (AoE, Projectiles).
