# Typed events and event waits

`EventSource<EventMap>` is the shared engine primitive for entity, capability,
and content command events. Create content sources with
`simulation.createEventSource<EventMap>(owner?)`. An owner's lifetime closes the
source on death or removal. Unowned sources require explicit closure; reset and
disposal close all sources. Sources belong to one simulation.

`source.on(name, callback, scope?)` returns an idempotent release function.
Callbacks run synchronously in registration order. Additions observe future
emissions; released listeners are skipped. Callback failures do not skip
remaining notifications. `source.onClose(callback, scope?)` observes closure;
close delivery also skips listeners unsubscribed by earlier callbacks. Already
closed sources immediately invoke new close observers. Unsubscribing removes
the scope cleanup registration and releases the callback reference. Source
closure does the same for every remaining subscription.

`entity.events` publishes `damaged` (actual health lost, source/target IDs, and
whether the hit killed), `death`, and `removed`. Direct `takeDamage`, resolved
hits, impact damage, and periodic damage publish through the health change.
Combat cooldowns commit before synchronous damage observers run.
`simulation.events` is a presentation buffer derived from those damage events;
draining it does not affect scripts. `entity.lifetime` releases on death or
removal. Entity events stay open after death until removal, allowing other
entities to observe retirement. Use the observer's scope when awaiting another
entity's removal, rather than the target's lifetime.

Entity sources bind in `Simulation.add`. Assembly may register callbacks before
binding; unregistered health changes do not publish events. Emitting on or
waiting for an unbound source is an authoring error. Publishers capture immutable
value snapshots; entity references remain live objects. Custom publishers must
capture values they intend to preserve instead of reusing mutable payloads.

```ts
const outcome = yield* perform(waitForEvent(enemy.events, "damaged", {
  filter: event => event.sourceId === entity.runtimeId,
  timeoutMs: 500,
}));
if (outcome.kind === "event") {
  // outcome.payload is typed to the selected event.
  // outcome.stamp contains the emission's nowMs, tick, and global sequence.
}
```

`waitForEvent(source, name, { filter?, timeoutMs? })` arms when started and
observes future events only. Its result is `{ kind: "event", payload, stamp }`,
`{ kind: "timeout" }`, or `{ kind: "source-closed" }`. Cancellation releases
observation and never resumes the generator. A failing filter fails its waiting
script at the next barrier without failing the publisher.

Event and closure results become ready at the next simulation-step barrier,
before entity updates. Callbacks can immediately decide contact policy; waiting
generators cannot resume on the emitting stack or consume the emission tick's
remaining time. Timeouts use absolute simulation time and resolve on the first
step reaching their deadline. An event captured before the deadline wins even
if resumed after it; an emission at the deadline loses to timeout. Timeouts must
be finite nonnegative milliseconds; zero completes immediately. Reset cancels
owned tasks, closes sources, and clears staged delivery and deadlines.

Events do not replay history. Content accepting commands before its script starts
should subscribe during assembly and retain its authoritative command state:

```ts
interface Commands { deploy: Readonly<{ atMs: number }>; }
const commands = simulation.createEventSource<Commands>(actor.entity);
commands.on("deploy", ({ atMs }) => { deployment.atMs ??= atMs; }, actor.entity.lifetime);
commands.emit("deploy", Object.freeze({ atMs: simulation.nowMs }));
```

See [operation results](script-results.md) for `perform` and typed generator returns.

The saucer records its first deployment timestamp this way and uses an event
wait to interrupt beams. Muscle Man observes damage through entity events and
waits for his dumbbell's wall event before steering its return. Immediate wall
response remains synchronous.

Related: [projectile events](projectile-scripting.md#projectile-lifecycle-events), [resources](script-resources.md).
