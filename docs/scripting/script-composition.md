# Concurrent operation composition

### Concurrent operations

`all(...operations)` runs operations concurrently and completes when all have
completed. `race(...operations)` completes with the first operation and cancels
the remaining operations. Each operation has its own scope and cleanup.
`sequence(factory)` turns a generator sequence into an inert operation for
composition. Its factory runs only at admission. Foreground tasks and sequence
branches use the same `OperationRunner`; there is one generator execution path.
Move admission and cooldown still belong to the single foreground task.

```ts
yield all(
  sequence(patrol),
  sequence(function* () {
    yield race(until(() => deploying), sequence(beams));
    yield* deployAllies();
  }),
);
```

Each branch keeps its own operation scopes and carries unused time to its next
yield. A rejected nested operation stops the foreground task and releases all
branches. Initial rejection commits no cooldown; rejection after a task has
already started keeps the committed cooldown. Immediately returning sequences complete successfully; a foreground generator
that admits no operation does not commit cooldown. Cancellation closes generators and their scopes; synchronous
code already running reaches its next yield before closing.

Operations that may complete during an advance before consuming the full budget
must expose `nextBoundaryMs`, the time until their next possible completion.
Omitting it promises that `advance` consumes its full budget unless the
operation is already complete. Contact-only completion may omit it. Compound
operations use these boundaries to slice simulation time accurately.

Compound operation startup is sequential. Resources acquired by earlier
operations are rolled back if a later startup fails, but irreversible startup
effects cannot be undone. Put fallible resource acquisition in an outer
`scoped` operation before emission or damage operations.

Related: [operation results](script-results.md), [resources](script-resources.md).
