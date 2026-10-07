# Typed operation results

`ScriptOperation<TResult>` carries a result into the shared `OperationRunner`.
Value operations require a `result` member typed as `TResult`; only `void`
operations may omit it. Built-in value getters throw before completion; explicit
`undefined` results remain valid when included in the declared result type.
Use `yield* perform(operation)` to obtain its precise type in a
`ScriptGenerator<TResult>`. Raw `yield operation` receives `unknown` because
heterogeneous operations share one generator. Existing effect operations return
`void`. `sequence` returns its generator's result (including immediate returns),
`scoped` preserves that result, `all` returns a readonly tuple in branch order,
and `race` returns a discriminated `{ index, result }` union. At a shared boundary,
the lowest ready branch index wins. Losing branches cancel and release resources.
Races require at least one branch in both TypeScript and runtime calls. Empty
`all()` completes with `[]`. The runner and collections use `AnyScriptOperation`
at heterogeneous boundaries; content uses `ScriptGenerator`, with `TaskGenerator`
as the behavior runtime's gameplay alias.

```ts
const winner = yield* perform(race(
  waitForEvent(projectileFlight.events, "impact"),
  wait(500),
));
if (winner.index === 0 && winner.result.kind === "event") {
  const target = winner.result.payload.other;
}
```

Related: [event waits](script-events.md), [composition](script-composition.md), [verification](../authoring/verification.md).
