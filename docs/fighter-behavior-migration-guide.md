# Fighter Behavior & Modular Skills Migration Guide

## 1. Context & Architectural Overview

The Duels2D combat system was recently refactored to decouple character-specific mechanics from the monolithic [`AbilitySystem`](../src/abilities/ability-system.ts). 

The system follows an **Orchestrator & Instrument** pattern:
1. **Modular Skills (`src/skills/`)**: Standalone, reusable mechanics (physics, movement, termination rules, completion hooks). They do not know about specific fighters or what skill comes next.
2. **Fighter Behaviors (`src/behaviors/`)**: Character-owned scripts that orchestrate when and how skills are triggered, chained, or interrupted.
3. **Behavior Registry (`src/behaviors/registry.ts`)**: Maps fighter `id` to their behavior class. If a fighter doesn't have a custom script, it falls back to [`DefaultFighterBehavior`](../src/behaviors/default-behavior.ts) (which runs standard JSON abilities).

---

## 2. Current Implementation Status

### Completed
* **Skills**:
  * [`src/skills/dash-skill.ts`](../src/skills/dash-skill.ts): Reusable directional dash with configurable `stopOn` conditions (`["fighter-collision", "wall-collision"]`), force acceleration, and callbacks (`onHitEnemy`, `onHitWall`, `onComplete`).
  * [`src/skills/wall-crawl-skill.ts`](../src/skills/wall-crawl-skill.ts): Perimeter tracking, wall attachment, orientation calculation, duration timer, and `onComplete` hook.
* **Behaviors**:
  * [`src/behaviors/fighter-behavior.ts`](../src/behaviors/fighter-behavior.ts): Abstract base class with lifecycle hooks: `onUpdate(deltaMs)`, `onWallCollision(wall, bounds)`, `onFighterCollision(target)`, `isWallCrawling()`, `getWallCrawlAngle()`.
  * [`src/behaviors/fighters/babyman.behavior.ts`](../src/behaviors/fighters/babyman.behavior.ts): Composes `WallCrawlSkill` and `DashSkill` into a wall-contact combo.
  * [`src/behaviors/default-behavior.ts`](../src/behaviors/default-behavior.ts): Standard handler for pure-JSON fighters.
  * [`src/behaviors/registry.ts`](../src/behaviors/registry.ts): Factory and registry.

### Remaining Fighters & Skills to Migrate
The following fighters are currently running via `DefaultFighterBehavior` and can be migrated to dedicated behavior scripts:

| Fighter | Current Ability in JSON | Modular Skill Needed | Target Behavior File |
| :--- | :--- | :--- | :--- |
| **Angry Man** (`angryman`) | `charge` (dash with long windup) | `DashSkill` (already implemented) | `src/behaviors/fighters/angryman.behavior.ts` |
| **Chef Man** (`chefman`) | `throw-kitchen-tool` (knife projectile) | `ProjectileSkill` (to extract) | `src/behaviors/fighters/chefman.behavior.ts` |
| **Depressed Man** (`depressedman`) | `throw-tear` (tear projectile) | `ProjectileSkill` (to extract) | `src/behaviors/fighters/depressedman.behavior.ts` |
| **Happy Man** (`happyman`) | `slap` (melee swing) | `SwingSkill` (to extract) | `src/behaviors/fighters/happyman.behavior.ts` |
| **Woman Man** (`womanman`) | `handbag-swing` (melee swing) | `SwingSkill` (to extract) | `src/behaviors/fighters/womanman.behavior.ts` |

---

## 3. Step-by-Step Instructions for the Next Agent

### Step 1: Extract Remaining Reusable Skills into `src/skills/`

1. **`SwingSkill` (`src/skills/swing-skill.ts`)**:
   * Reference logic: [`src/abilities/actions/swing-action.ts`](../src/abilities/actions/swing-action.ts) and [`src/entities/fighter-presentation.ts`](../src/entities/fighter-presentation.ts).
   * Encapsulate weapon rotation, active hit window frames, and `onHitEnemy` / `onComplete` callbacks.
2. **`ProjectileSkill` (`src/skills/projectile-skill.ts`)**:
   * Reference logic: [`src/abilities/actions/projectile-action.ts`](../src/abilities/actions/projectile-action.ts) and [`src/entities/projectile.ts`](../src/entities/projectile.ts).
   * Encapsulate spawning projectile entities, targeting calculation, and launch impulses.

---

### Step 2: Implement Dedicated Fighter Behaviors

Create a `.behavior.ts` file in `src/behaviors/fighters/` for each character.

#### Blueprint: Migrating a Dash Fighter (e.g., Angry Man)
```typescript
import { DashSkill } from "../../skills/dash-skill";
import type { Fighter } from "../../entities/fighter";
import { FighterBehavior } from "../fighter-behavior";
import type { FighterBehaviorContext } from "../types";

export class AngryManBehavior extends FighterBehavior {
      private readonly dashSkill = new DashSkill();

      override onUpdate(deltaMs: number): void {
            if (this.fighter.isDead) {
                  this.reset();
                  return;
            }
            if (this.dashSkill.isActive) {
                  this.dashSkill.update(deltaMs);
            }
            this.fighter.abilities.update();

            // Evaluate trigger when idle
            if (this.fighter.abilities.state === "idle") {
                  const now = performance.now();
                  const ability = this.fighter.config.abilities[0];
                  if (ability && this.fighter.abilities.canUse(ability, now)) {
                        const target = this.context.getNearestEnemy(this.fighter);
                        if (target) {
                              this.startCharge(ability, target, now);
                        }
                  }
            }
      }

      private startCharge(ability: any, target: Fighter, now: number): void {
            this.fighter.abilities.start(ability, this.fighter.facing, now);
            // Wait for windup to complete, then start dash
            // (or observe state change in onUpdate)
      }

      override onFighterCollision(target: Fighter): void {
            if (this.dashSkill.isActive) {
                  this.dashSkill.handleFighterCollision(target);
            }
      }

      override reset(): void {
            this.dashSkill.stop();
            this.fighter.abilities.reset();
      }
}
```

#### Blueprint: Migrating a Projectile Fighter (e.g., Depressed Man / Chef Man)
```typescript
import { ProjectileSkill } from "../../skills/projectile-skill";
import { FighterBehavior } from "../fighter-behavior";

export class DepressedManBehavior extends FighterBehavior {
      private readonly projectileSkill = new ProjectileSkill();

      override onUpdate(deltaMs: number): void {
            // Check trigger -> windup -> fire projectile via projectileSkill
      }
}
```

---

### Step 3: Register in `src/behaviors/registry.ts`

Import the new behavior class and add it to `BEHAVIOR_REGISTRY`:

```typescript
// src/behaviors/registry.ts
import { BabyManBehavior } from "./fighters/babyman.behavior";
import { AngryManBehavior } from "./fighters/angryman.behavior";
import { ChefManBehavior } from "./fighters/chefman.behavior";
// ...

const BEHAVIOR_REGISTRY = new Map<string, FighterBehaviorConstructor>([
      ["babyman", BabyManBehavior],
      ["angryman", AngryManBehavior],
      ["chefman", ChefManBehavior],
      // add remaining here
]);
```

---

### Step 4: Verification Checklist

1. **Config Validation**:
   ```bash
   node tools/validate-config.js
   ```
   Ensure all JSON character files remain valid.
2. **Fighter Facing & Audio**:
   * Ensure `fighter.facing` correctly updates toward targets or movement directions.
   * Ensure audio cues trigger on ability phases (`fighter.audio.playAbilityCue(ability, "hit" | "windup")`).
3. **Collision Registration**:
   * Verify damage numbers show via `this.context.dealDamage(...)`.
   * Verify knockback applies via `this.context.applyKnockback(...)`.
