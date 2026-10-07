import { expectTypeOf } from "vitest";
import { all, EventSource, perform, race, scoped, sequence, wait, waitForEvent,
      type AnyScriptOperation, type OperationResult, type ScriptGenerator, type ScriptOperation } from "../../src/engine/scripting";

const lifecycle = {
      start: () => true, advance: (deltaMs: number) => deltaMs, isComplete: true, cancel: () => {},
};
const effect: ScriptOperation = lifecycle;
const value: ScriptOperation<number> = { ...lifecycle, get result() { return 42; } };
expectTypeOf<OperationResult<typeof effect>>().toEqualTypeOf<void>();
expectTypeOf<OperationResult<typeof value>>().toEqualTypeOf<number>();

// @ts-expect-error A value operation must supply its result.
const missingResult: ScriptOperation<number> = { ...lifecycle };
// @ts-expect-error A value result cannot include undefined unless the declared value type does.
const partialResult: ScriptOperation<number> = { ...lifecycle, result: undefined as number | undefined };
// @ts-expect-error Returning undefined explicitly still requires a result member.
const missingUndefinedResult: ScriptOperation<undefined> = { ...lifecycle };
const undefinedResult: ScriptOperation<undefined> = { ...lifecycle, result: undefined };
void [missingResult, partialResult, missingUndefinedResult, undefinedResult];

// @ts-expect-error Empty races have no winner.
race();
const possiblyEmpty: AnyScriptOperation[] = [];
// @ts-expect-error An arbitrary array cannot establish the required first race branch.
race(...possiblyEmpty);
const nonempty: [AnyScriptOperation, ...AnyScriptOperation[]] = [effect];
race(...nonempty);
const emptyAll = all();
expectTypeOf(emptyAll.result).toEqualTypeOf<readonly []>();

const events = new EventSource<{ hit: Readonly<{ targetId: string }>; signal: number }>();
events.emit("signal", 1);
// @ts-expect-error Signal payloads must be numbers.
events.emit("signal", "invalid");
// @ts-expect-error Event names come from the source's event map.
waitForEvent(events, "missing");
// @ts-expect-error The filter parameter is the selected event's payload.
waitForEvent(events, "hit", { filter: (event: number) => event > 0 });

// Compiled by normal typecheck/test/build commands; this function is never executed.
export function* verifyResults(): ScriptGenerator {
      const result = yield* perform(value);
      expectTypeOf(result).toEqualTypeOf<number>();
      const noResult = yield* perform(effect);
      expectTypeOf(noResult).toEqualTypeOf<void>();
      const optionalValue = yield* perform(undefinedResult);
      expectTypeOf(optionalValue).toEqualTypeOf<undefined>();
      const values = yield* perform(all(value, wait(1), sequence(function* () { return "done"; })));
      expectTypeOf(values).toEqualTypeOf<readonly [number, void, string]>();
      const held = yield* scoped(() => () => {}, function* () { return yield* perform(value); });
      expectTypeOf(held).toEqualTypeOf<number>();
      const winner = yield* perform(race(value, waitForEvent(events, "hit")));
      if (winner.index === 0) {
            expectTypeOf(winner.result).toEqualTypeOf<number>();
            // @ts-expect-error The numeric branch has no event payload.
            winner.result.payload;
      } else if (winner.result.kind === "event") {
            expectTypeOf(winner.result.payload).toEqualTypeOf<Readonly<{ targetId: string }>>();
            // @ts-expect-error This branch's payload has no strength field.
            winner.result.payload.strength;
      }
      const outcome = yield* perform(waitForEvent(events, "signal"));
      if (outcome.kind === "event") expectTypeOf(outcome.payload).toEqualTypeOf<number>();
      else {
            // @ts-expect-error Timeout and closure carry no event payload.
            outcome.payload;
      }
}
