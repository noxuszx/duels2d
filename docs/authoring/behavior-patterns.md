# Behavior patterns

These snippets assume equipped handles and configured move settings.
Read only the matching pattern; exact signatures live in source.

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

Related: [fighter authoring](fighter-authoring.md), [scripting reference](../scripting/scripting-primitives.md).
