import * as Matter from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import { Entity } from "../src/engine/entity";
import { during } from "../src/engine/scripting/during";
import { tween } from "../src/engine/scripting/tween";
import { wait } from "../src/engine/scripting/wait";
import { scoped } from "../src/engine/scripting/scoped";
import { ScriptScope } from "../src/engine/scripting/scope";
import type { FighterConfig } from "../src/types/fighter";

function setup() {
      const owner = new Entity({
            runtimeId: "owner:1", configId: "fixture", teamId: "a",
            body: Matter.Bodies.circle(0, 0, 10),
            config: { id: "fixture", maxHealth: 100, defaultFacing: "right", image: null } as FighterConfig,
      });
      const runtime = new BehaviorRuntime(owner, {
            now: () => 0, entities: () => [owner], isCombatActive: () => true,
      });
      owner.setBehavior(runtime);
      return { owner, runtime };
}
const move = { id: "sequence", cooldownMs: 100 };

describe("simulation timelines", () => {
      it("initializes once, delivers partial steps, and shares remaining time with the next operation", () => {
            const { runtime } = setup();
            const ticks = vi.fn();
            const progress = vi.fn();
            const result = runtime.start(move, null, function* () {
                  yield during(10, ticks);
                  yield tween(8, progress);
            });
            expect(ticks.mock.calls).toEqual([[0, 0]]);
            runtime.update(6);
            runtime.update(9);
            expect(ticks.mock.calls).toEqual([[0, 0], [6, 6], [4, 10]]);
            expect(progress.mock.calls).toEqual([[0, 0], [5 / 8, 5]]);
            runtime.update(10);
            expect(progress.mock.calls.at(-1)).toEqual([1, 8]);
            expect(result.started && result.handle.state).toBe("completed");
      });

      it("runs zero-duration callbacks once and does not synthesize a cancelled endpoint", () => {
            const ticks = vi.fn();
            const progress = vi.fn();
            const zero = during(0, ticks);
            const instant = tween(0, progress);
            zero.start(new ScriptScope());
            instant.start(new ScriptScope());
            zero.advance(10);
            instant.advance(10);
            expect(ticks.mock.calls).toEqual([[0, 0]]);
            expect(progress.mock.calls).toEqual([[1, 0]]);
            const partial = tween(10, progress);
            partial.start(new ScriptScope());
            partial.advance(3);
            partial.cancel("interrupted");
            partial.advance(100);
            expect(progress.mock.calls).toEqual([[1, 0], [0, 0], [0.3, 3]]);
            expect(partial.isComplete).toBe(false);
      });

      it("rejects invalid durations for all timeline primitives", () => {
            for (const duration of [-1, NaN, Infinity]) {
                  expect(() => wait(duration)).toThrow(RangeError);
                  expect(() => during(duration, () => {})).toThrow(RangeError);
                  expect(() => tween(duration, () => {})).toThrow(RangeError);
            }
      });

      it("normalizes fixed-step floating point drift without an extra callback or tick", () => {
            const { runtime } = setup();
            const ticks = vi.fn();
            const result = runtime.start(move, null, function* () { yield during(875, ticks); });
            for (let index = 0; index < 105; index++) runtime.update(1000 / 120);
            expect(ticks).toHaveBeenCalledTimes(106);
            expect(ticks.mock.calls.at(-1)?.[0]).toBeLessThanOrEqual(1000 / 120);
            expect(ticks.mock.calls.at(-1)?.[1]).toBe(875);
            expect(result.started && result.handle.state).toBe("completed");
      });
});

describe("resource sequences", () => {
      it("acquires on operation start and holds a lease across all inner operations", () => {
            const { owner, runtime } = setup();
            const acquire = vi.fn(() => owner.resources.acquireExclusive("locomotion"));
            const sequence = scoped(acquire, function* () { yield wait(5); yield wait(8); });
            const acquisition = sequence.next().value!;
            expect(acquire).not.toHaveBeenCalled();
            sequence.return(undefined);
            const result = runtime.start(move, null, () => scoped(acquire, function* () {
                  yield wait(5);
                  expect(owner.resources.isHeld("locomotion")).toBe(true);
                  yield wait(8);
            }));
            expect(acquisition).toBeDefined();
            expect(owner.resources.isHeld("locomotion")).toBe(true);
            runtime.update(6);
            expect(owner.resources.isHeld("locomotion")).toBe(true);
            runtime.update(7);
            expect(owner.resources.isHeld("locomotion")).toBe(false);
            expect(result.started && result.handle.state).toBe("completed");
      });

      it("rejects a failed acquisition, releases partial resources, and preserves cooldown", () => {
            const { runtime } = setup();
            const release = vi.fn();
            const inner = vi.fn();
            expect(runtime.start(move, null, () => scoped(scope => {
                  scope.use(release);
                  return null;
            }, function* () { inner(); yield wait(5); })))
                  .toEqual({ started: false, reason: "resource-conflict" });
            expect(inner).not.toHaveBeenCalled();
            expect(release).toHaveBeenCalledOnce();
            expect(runtime.start(move, null, function* () { yield wait(1); }).started).toBe(true);
      });

      it("releases multiple resources in reverse order once, including automatic registration", () => {
            const { runtime } = setup();
            const released: string[] = [];
            const resource = { release: () => released.push("second") };
            runtime.start(move, null, () => scoped(scope => {
                  scope.use(() => released.push("first"));
                  return scope.use(resource);
            }, function* () { yield wait(5); yield wait(8); }));
            runtime.update(6);
            expect(released).toEqual([]);
            runtime.cancel("interrupted");
            runtime.cancel("interrupted");
            expect(released).toEqual(["second", "first"]);
      });

      it("cleans up callback, acquisition, and generator exceptions", () => {
            for (const source of ["acquire", "tick", "generator"] as const) {
                  const { runtime } = setup();
                  const release = vi.fn();
                  const start = () => runtime.start(move, null, () => scoped(scope => {
                        scope.use(release);
                        if (source === "acquire") throw new Error("failure");
                        return {};
                  }, function* () {
                        if (source === "generator") throw new Error("failure");
                        yield during(5, delta => { if (delta > 0) throw new Error("failure"); });
                  }));
                  if (source === "tick") {
                        start();
                        expect(() => runtime.update(2)).toThrow("failure");
                  } else expect(start).toThrow("failure");
                  expect(release).toHaveBeenCalledOnce();
                  expect(runtime.isRunning).toBe(false);
            }
      });

      it("supports reentrant cancellation in acquisition, generator code, and timeline callbacks", () => {
            for (const source of ["acquire", "generator", "tick"] as const) {
                  const { runtime } = setup();
                  const release = vi.fn();
                  const later = vi.fn();
                  runtime.start(move, null, () => scoped(() => {
                        if (source === "acquire") runtime.cancel("interrupted");
                        return release;
                  }, function* () {
                        if (source === "generator") runtime.cancel("interrupted");
                        yield during(5, delta => {
                              if (source === "tick" && delta > 0) runtime.cancel("interrupted");
                        });
                        later();
                  }));
                  runtime.update(2);
                  runtime.update(10);
                  expect(release).toHaveBeenCalledOnce();
                  expect(later).not.toHaveBeenCalled();
                  expect(runtime.isRunning).toBe(false);
            }
      });
});
