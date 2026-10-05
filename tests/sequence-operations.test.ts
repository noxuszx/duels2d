import * as Matter from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import { Entity } from "../src/engine/entity";
import { all } from "../src/engine/scripting/all";
import { during } from "../src/engine/scripting/during";
import type { ScriptOperation } from "../src/engine/scripting/operation";
import { race } from "../src/engine/scripting/race";
import { ScriptScope } from "../src/engine/scripting/scope";
import { scoped } from "../src/engine/scripting/scoped";
import { sequence } from "../src/engine/scripting/sequence";
import { wait } from "../src/engine/scripting/wait";

function runtimeFixture() {
      const owner = new Entity({ runtimeId: "fixture", configId: "fixture", teamId: "a",
            body: Matter.Bodies.circle(0, 0, 10), config: { id: "fixture", maxHealth: 100 } });
      return new BehaviorRuntime(owner, { now: () => 0, entities: () => [owner], isCombatActive: () => true });
}
const move = { id: "sequence", cooldownMs: 100 };

describe("generator operation composition", () => {
      it("defers factory and resource acquisition until admission, preserving initial rejection and cooldown", () => {
            const runtime = runtimeFixture();
            const acquire = vi.fn(() => null);
            const factory = vi.fn(function* () { yield* scoped(acquire, function* () { yield wait(10); }); });
            const operation = sequence(factory);
            expect(factory).not.toHaveBeenCalled();
            expect(runtime.start(move, null, function* () { yield operation; })).toEqual({ started: false, reason: "resource-conflict" });
            expect(acquire).toHaveBeenCalledOnce();
            expect(runtime.start(move, null, function* () { yield wait(10); }).started).toBe(true);
      });

      it.each([false, true])("race respects every boundary of a losing sequence (reverse=%s)", reverse => {
            const scopes = [vi.fn(), vi.fn(), vi.fn()];
            const ticks = [vi.fn(), vi.fn(), vi.fn()];
            const loser = sequence(function* () {
                  for (let index = 0; index < 3; index++) {
                        yield* scoped(() => scopes[index], function* () { yield during(4, ticks[index]); });
                  }
            });
            const winner = wait(6);
            const operation = race(...(reverse ? [loser, winner] : [winner, loser]));
            const scope = new ScriptScope();
            expect(operation.start(scope)).toBe(true);
            expect(operation.advance(20)).toBe(6);
            expect(ticks[0].mock.calls).toEqual([[0, 0], [4, 4]]);
            expect(ticks[1].mock.calls).toEqual([[0, 0], [2, 2]]);
            expect(ticks[2]).not.toHaveBeenCalled();
            expect(scopes.map(fn => fn.mock.calls.length)).toEqual([1, 1, 0]);
      });

      it("all transfers unused sequence time to the following foreground operation", () => {
            const runtime = runtimeFixture();
            const after = vi.fn();
            const result = runtime.start(move, null, function* () {
                  yield all(sequence(function* () { yield wait(3); yield wait(4); }), wait(5));
                  yield during(10, after);
            });
            runtime.update(12);
            expect(after.mock.calls).toEqual([[0, 0], [5, 5]]);
            runtime.update(5);
            expect(result.started && result.handle.state).toBe("completed");
      });

      it("drains immediate starts and rejects an empty branch without committing cooldown", () => {
            const runtime = runtimeFixture();
            expect(runtime.start(move, null, function* () { yield sequence(function* () {}); }).started).toBe(false);
            const calls: number[] = [];
            expect(runtime.start(move, null, function* () {
                  yield sequence(function* () { yield during(0, () => calls.push(1)); yield during(0, () => calls.push(2)); });
            }).started).toBe(true);
            expect(calls).toEqual([1, 2]);
      });

      it.each(["generator", "start", "advance", "release"] as const)("cleans up reentrant cancellation from %s", source => {
            const runtime = runtimeFixture();
            const release = vi.fn(() => { if (source === "release") runtime.cancel("interrupted"); });
            const closed = vi.fn();
            const later = vi.fn();
            runtime.start(move, null, function* () {
                  yield sequence(function* () {
                        try {
                              if (source === "generator") runtime.cancel("interrupted");
                              yield* scoped(() => release, function* () {
                                    yield during(5, delta => {
                                          if ((source === "start" && delta === 0) || (source === "advance" && delta > 0)) runtime.cancel("interrupted");
                                    });
                              });
                              yield during(0, later);
                        } finally { closed(); }
                  });
            });
            runtime.update(10);
            expect(runtime.isBusy).toBe(false);
            expect(closed).toHaveBeenCalledOnce();
            expect(later).not.toHaveBeenCalled();
            expect(release).toHaveBeenCalledTimes(source === "generator" ? 0 : 1);
      });

      it("settles externally completed nested race at zero time before advancing its sibling", () => {
            let ready = false;
            let active = false;
            const signal: ScriptOperation = {
                  start: () => { active = true; return true; }, advance: delta => delta,
                  get isComplete() { return active && ready; }, cancel: () => { active = false; },
            };
            const beam = vi.fn();
            const after = vi.fn();
            const patrol = vi.fn();
            const operation = all(
                  sequence(function* () {
                        yield race(signal, sequence(function* () { yield during(100, beam); }));
                        yield during(10, after);
                  }),
                  sequence(function* () { yield during(100, patrol); }),
            );
            expect(operation.start(new ScriptScope())).toBe(true);
            ready = true;
            expect(operation.advance(5)).toBe(5);
            expect(beam.mock.calls).toEqual([[0, 0]]);
            expect(after.mock.calls).toEqual([[0, 0], [5, 5]]);
            expect(patrol.mock.calls).toEqual([[0, 0], [5, 5]]);
            operation.cancel("interrupted");
      });

      it("forwards contacts and drains the next operation without waiting for another tick", () => {
            const runtime = runtimeFixture();
            let complete = false;
            const contacted = vi.fn(() => { complete = true; });
            const after = vi.fn();
            runtime.start(move, null, function* () {
                  yield sequence(function* () {
                        yield { start: () => true, advance: delta => delta, get isComplete() { return complete; }, cancel: () => {}, contact: contacted };
                        yield during(5, after);
                  });
            });
            runtime.contact({} as Parameters<BehaviorRuntime["contact"]>[0]);
            expect(contacted).toHaveBeenCalledOnce();
            expect(after.mock.calls).toEqual([[0, 0]]);
      });

      it.each(["all", "race"] as const)("propagates a later rejection through %s as a rejected foreground task", mode => {
            const runtime = runtimeFixture();
            const released = vi.fn();
            const after = vi.fn();
            const closed = vi.fn();
            const result = runtime.start(move, null, function* () {
                  yield (mode === "all" ? all : race)(
                        sequence(function* () {
                              yield wait(5);
                              yield* scoped(() => null, function* () { yield during(0, after); });
                        }),
                        sequence(function* () {
                              try { yield* scoped(() => released, function* () { yield wait(100); }); }
                              finally { closed(); }
                        }),
                  );
                  yield during(0, after);
            });
            expect(() => runtime.update(20)).not.toThrow();
            expect(result.started && result.handle.state).toBe("rejected");
            expect(result.started && result.handle.reason).toBe("resource-conflict");
            expect(released).toHaveBeenCalledOnce();
            expect(closed).toHaveBeenCalledOnce();
            expect(after).not.toHaveBeenCalled();
            expect(runtime.readiness(move, null)).toBe("cooldown");
      });

      it.each(["generator", "callback", "release"] as const)("preserves a %s error while closing every sequence branch", source => {
            const runtime = runtimeFixture();
            const releases = [vi.fn(), vi.fn()];
            const closed = [vi.fn(), vi.fn()];
            const result = runtime.start(move, null, function* () {
                  yield all(...[0, 1].map(index => sequence(function* () {
                        try {
                              yield* scoped(() => () => {
                                    releases[index]();
                                    if (index === 0 && source === "release") throw new Error("sequence failure");
                              }, function* () {
                                    yield during(5, delta => {
                                          if (index === 0 && source === "callback" && delta > 0) throw new Error("sequence failure");
                                    });
                                    if (index === 0 && source === "generator") throw new Error("sequence failure");
                              });
                        } finally { closed[index](); }
                  })));
            });
            expect(() => runtime.update(10)).toThrow("sequence failure");
            expect(releases.map(fn => fn.mock.calls.length)).toEqual([1, 1]);
            expect(closed.map(fn => fn.mock.calls.length)).toEqual([1, 1]);
            expect(result.started && result.handle.state).toBe("cancelled");
            expect(runtime.isBusy).toBe(false);
      });
});
