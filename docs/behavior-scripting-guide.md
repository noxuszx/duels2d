# Behavior Scripting Guide & Cheat Sheet

This guide serves as a practical, copy-pasteable reference for authoring fighter behavior scripts (`src/content/fighters/<id>/behavior.ts`) using the Duels2D simulation primitives, equipped components, and script helpers.

---

## 1. Structure of a Behavior Script

A behavior module exports a factory function returning `BehaviorHandlers`:

```typescript
import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type {
      Forms,
      MeleeAttack,
      ProjectileEmitter,
      SpriteAim,
      Targeting,
      Visuals,
      MovementControl,
      WallCrawl,
      Dash,
} from "../../../gameplay/components";
import {
      wait,
      during,
      tween,
      all,
      race,
      sequence,
      scoped,
} from "../../../engine/scripting";
import {
      pauseMovement,
      shake,
      steer,
      burst,
      poseSequence,
      until,
} from "../../script-helpers";

interface FighterComponents {
      targeting: Targeting;
      visuals: Visuals;
      // ...equipped components defined in definition.ts
}

export function myFighterBehavior(
      components: FighterComponents,
      context: FighterContext,
): BehaviorHandlers {
      const { targeting, visuals } = components;
      const { entity, config } = context;

      return {
            // Optional: runs once when entity spawns
            *onSpawn() {
                  yield wait(0);
            },

            // Optional: event triggers (e.g. wall collision)
            *onWallContact({ wall }) {
                  // handle wall interaction
            },

            // Main AI/Decision action table evaluated every simulation step
            actions: {
                  "move-id": {
                        interrupt: false, // set true for high-priority reactions (e.g. transformation)
                        when: () => {
                              // Pure predicate: return true when move is ready and eligible
                              const enemy = targeting.nearestEnemy();
                              return !!enemy;
                        },
                        *run() {
                              // Generator sequence executed upon admission
                        },
                  },
            },
      };
}
```

---

## 2. Yieldable Primitives Quick Reference

Every step in `*run()` or event handlers must `yield` a `ScriptOperation` (or `yield*` a generator helper).

### Time & Interpolation (`src/engine/scripting`)

| Primitive | Signature | Use Case |
|---|---|---|
| `wait(durationMs)` | `wait(ms)` | Pause / delay simulation time. |
| `during(durationMs, (deltaMs, elapsedMs) => void)` | `during(ms, fn)` | Simulation-time work over duration (steering, physics adjustments, continuous tick logic). First call receives `(0, 0)`. |
| `tween(durationMs, (progress) => void)` | `tween(ms, fn)` | Smoothly interpolate progress `0..1` (visual offset, rotation, easing). Reaches `1` upon complete. |

```typescript
// Wait 300ms
yield wait(300);

// Interpolate visual offset over 400ms
yield tween(400, progress => {
      visuals.offset.set({ x: Math.sin(progress * Math.PI * 4) * 5, y: 0 });
});
```

### Combinators (`src/engine/scripting`)

| Combinator | Signature | Behavior |
|---|---|---|
| `all(...operations)` | `all(op1, op2, ...)` | Runs operations in parallel. Completes when **all** finish. |
| `race(...operations)` | `race(op1, op2, ...)` | Runs operations in parallel. Completes when the **first** finishes, cancelling the others. |
| `sequence(generatorFn)` | `sequence(function* () { ... })` | Wraps a generator sequence into a composite `ScriptOperation`. |

```typescript
// Wind up pose while shaking simultaneously:
yield all(
      visuals.pose("attackWindup", 500),
      shake(entity, 500, 6)
);

// Dash toward enemy, but cancel dash if enemy dies or becomes invalid:
yield race(
      dash.start(target),
      until(() => !target.isAlive)
);
```

### Scoped Acquisition (`src/engine/scripting`)

`scoped(acquireFn, function* (resource) { ... })` acquires a lock/lease before running the inner generator and **guarantees release** when complete, interrupted, or cancelled:

```typescript
// Freeze movement while executing an attack sequence:
yield* scoped(
      () => pauseMovement(entity),
      function* () {
            yield visuals.pose("attackWindup", 300);
            yield melee.start(target, 200);
            yield visuals.pose("recovery", 150);
      }
);
```

---

## 3. Common Component Patterns

### Pattern A: Aimed Weapon Firing (Gun / Shotgun)
Equip: `targeting: Targeting`, `aim: SpriteAim`, `gun: ProjectileEmitter`, `visuals: Visuals`.

```typescript
"sniper-shot": {
      when: () => !!targeting.nearestEnemy(),
      *run() {
            const target = targeting.nearestEnemy();
            if (!target) return;

            // Track target with gun muzzle for duration of the shot
            yield* scoped(() => aim.track(target), function* () {
                  yield visuals.pose("attackWindup", move.windupMs);

                  const solution = aim.current;
                  if (!solution) return;

                  // Emit projectile along aimed ray
                  yield gun.emit({ position: solution.origin, direction: solution.direction });

                  yield visuals.pose("attackActive", move.attackDurationMs);
                  yield visuals.pose("recovery", move.recoveryMs);
            });
      },
}
```

### Pattern B: Melee Attack with Range Check
Equip: `targeting: Targeting`, `melee: MeleeAttack`, `visuals: Visuals`.

```typescript
"rolling-pin-strike": {
      when: () => {
            const target = targeting.nearestEnemy();
            return !!target && melee.inRange(target, move.rangePadding);
      },
      *run() {
            const target = targeting.nearestEnemy();
            if (!target) return;

            yield visuals.pose("attackWindup", move.windupMs);
            // Melee swing activates sensor hitbox for duration
            yield melee.start(target, move.attackDurationMs);
            yield visuals.pose("idle", move.recoveryMs);
      },
}
```

### Pattern C: Wall Crawl & Dash
Equip: `targeting: Targeting`, `wallCrawl: WallCrawl`, `dash: Dash`.

```typescript
*onWallContact({ wall }) {
      const target = targeting.nearestEnemy();
      if (!target) return;

      // Crawl along the wall toward the target
      yield wallCrawl.start(wall, { toward: target });

      // Dash towards enemy once crawling finishes
      const nextTarget = targeting.nearestEnemy();
      if (nextTarget) {
            yield dash.start(nextTarget);
      }
}
```

### Pattern D: Emergency Transformation / Stun Break (`interrupt: true`)
Equip: `forms: Forms`, `visuals: Visuals`.

```typescript
transformation: {
      interrupt: true, // Immediately aborts ongoing actions when triggered
      when: () => !forms.is("transformed") && forms.healthRatio <= 0.5,
      *run() {
            // Play cinematic transformation pose sequence
            yield* poseSequence(visuals, transformed.poses, transformed.sequence);
            forms.enter("transformed");
      },
}
```

### Pattern E: Multi-Shot Projectile Burst
Helper: `burst(emitter, count, intervalMs, geometryFactory)`.

```typescript
// Fire 3 projectiles in rapid succession
yield* burst(gun, 3, 100, () => {
      const target = targeting.nearestEnemy();
      if (!target) return null; // Abort burst if target is gone
      const dir = Vector2.normalize(Vector2.sub(target.body.position, entity.body.position));
      return { position: entity.body.position, direction: dir };
});
```

---

## 4. Rule Checklist for Behavior Authors

1. **Never mutate Matter bodies directly in scripts**:
   - Use `steer(entity, durationMs, velocityFn)` or `dash.start(...)` for velocity.
   - Use `visuals.pose(...)` or `PresentationState` leases for appearance.
2. **Never hardcode sound assets or audio playback in engine components**:
   - Emit sound cues in behaviors or configuration.
3. **Always wrap fallible resource holds with `scoped`**:
   - Aim leases, movement pauses, and visual orientations must release cleanly on interruption or knockback.
4. **Pure `when` predicates**:
   - Keep `when()` side-effect free. It will be called every tick by the behavior runtime to decide task admission.
