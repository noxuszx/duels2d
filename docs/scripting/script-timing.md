# Simulation-time operations

### Timed operations

`during(durationMs, callback)` invokes its callback with `(deltaMs, elapsedMs)`
as simulation time advances. Its first callback receives `(0, 0)` when it
starts, including when the requested duration is zero. A final partial advance
is reported with its actual consumed delta. Operations report consumed
simulation time so the runtime can pass the remainder of a tick to the next
yielded operation.

`tween(durationMs, callback)` reports normalized progress from zero through
one, using simulation time. A successful completion invokes the endpoint at
progress `1`, including a zero-duration tween. Cancellation does not synthesize
the successful endpoint callback.

```ts
yield during(800, (deltaMs, elapsedMs) => {
  // Simulation-time work, such as content-authored steering or math.
});

yield tween(300, progress => {
  offset.set({ x: Math.sin(progress * Math.PI * 8) * amplitude, y: 0 });
});
```

Related: [composition](script-composition.md), [resources](script-resources.md).
