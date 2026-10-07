# Scopes and presentation leases

### Scoped acquisition

`scoped(acquire, inner)` acquires a resource before running the inner generator
and releases it on completion, interruption, or cancellation. The acquisition
callback receives a scope and returns its resource or `null` when it cannot
acquire. If the initial acquisition rejects, it runs no inner work and commits
no cooldown. A move that already started an earlier operation has already
committed its cooldown. Register partial acquisitions with `scope.use(...)`;
they are released automatically if a later acquisition fails or throws.
Returned release functions or objects with `release()` are registered
automatically. A successful acquisition is an admitted operation.

```ts
yield* scoped(
  () => pauseMovement(entity),
  function* () {
    yield all(
      visuals.pose("attackWindup", 800),
      shake(entity, 800),
    );
  },
);
```

### Presentation offsets and rotations

Presentation exposes additive `acquireOffset()` and `acquireRotation()` leases.
Each lease supports `set(...)` and `release()`. Leases compose additively so a
script can add a temporary visual displacement or rotation without changing
physics or overwriting another effect. The shared presentation transform is
used consistently by the fighter body, held weapon, health bar, and muzzle
geometry; visual movement must not cause those elements to drift apart.

Offsets and rotations leave Matter body position, velocity, and colliders
unchanged. Aiming derives its world-space muzzle from the same transform as
the rendered weapon or sprite. Release each lease through a scope so it is
cleared on normal completion and cancellation.

Root offsets are world-space and root rotations are radians around the visual
root. `acquireOrientation("sprite" | "weapon", { angle, pivot? })` controls a
child's local orientation separately; the newest held child lease wins. Aiming
and wall crawl use child orientation while root effects remain additive.

`scope.add(cleanup)` returns a function that detaches the registration without
running cleanup. Active cleanup runs in reverse acquisition order; callbacks can
detach registrations still awaiting release. Resource deduplication uses weak
references so closed scopes do not retain released resources. Engine cleanup
and event dispatch use `runAll` from `src/engine/cleanup.ts` to finish every
remaining action and then propagate the first failure.

Related: [timing](script-timing.md), [content helpers](content-helpers.md).
