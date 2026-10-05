import * as Matter from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import type { ContactEvent } from "../src/engine/contracts";
import { Entity } from "../src/engine/entity";
import { all } from "../src/engine/scripting/all";
import { during } from "../src/engine/scripting/during";
import type { ScriptOperation } from "../src/engine/scripting/operation";
import { race } from "../src/engine/scripting/race";
import { ScriptScope } from "../src/engine/scripting/scope";
import { wait } from "../src/engine/scripting/wait";
import type { FighterConfig } from "../src/types/fighter";
import { Simulation } from "../src/engine/simulation";
import { Dasher } from "../src/gameplay/components/dash";

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
      const event: ContactEvent = {
            kind: "wall", wall: "left", self: owner, normal: { x: 1, y: 0 }, incomingSpeed: 1,
            policy: { defaultBounce: true, allowImpactDamage: true }, hadForegroundTask: true,
      };
      return { runtime, event };
}

function resourceOperation(inner: ScriptOperation, release: () => void): ScriptOperation {
      return {
            start(scope) { scope.use(release); return inner.start(scope); },
            advance: delta => inner.advance(delta),
            get isComplete() { return inner.isComplete; },
            get nextBoundaryMs() { return inner.nextBoundaryMs; },
            cancel: reason => inner.cancel(reason),
            contact: event => inner.contact?.(event),
      };
}
const move = { id: "concurrent", cooldownMs: 100 };

describe("concurrent simulation operations", () => {
      it.each([8, 100])("preserves dash force when a concurrent endpoint subdivides a physics tick (duration=%s)", durationMs => {
            const forceFor = (split: boolean) => {
                  const simulation = new Simulation({ seed: 1,
                        arena: { minX: 0, minY: 0, maxX: 500, maxY: 500 } });
                  const config = { id: "dash", maxHealth: 100, speed: 4 };
                  const owner = new Entity({ runtimeId: "owner", configId: "dash", teamId: "A", config,
                        body: Matter.Bodies.circle(100, 100, 10) });
                  const target = new Entity({ runtimeId: "target", configId: "dash", teamId: "B", config,
                        body: Matter.Bodies.circle(300, 100, 10) });
                  simulation.add(owner); simulation.add(target);
                  const dash = new Dasher({ entity: owner, simulation, config: owner.config }, {
                        speedMultiplier: 2, accelerationForce: .01, maxDurationMs: durationMs,
                        endOn: [], hit: { damage: 10 },
                  }).start(target);
                  const operation = split ? all(wait(2), dash) : dash;
                  const scope = new ScriptScope();
                  operation.start(scope);
                  operation.advance(8);
                  const force = { ...owner.body.force };
                  operation.cancel("interrupted"); scope.release(); simulation.dispose();
                  return force;
            };
            const unsplit = forceFor(false);
            expect(unsplit.x).toBeGreaterThan(0);
            expect(forceFor(true).x).toBeCloseTo(unsplit.x, 12);
      });

      it("all uses the longest branch duration and shares the tick remainder", () => {
            const { runtime } = setup();
            const short = vi.fn();
            const long = vi.fn();
            const after = vi.fn();
            const result = runtime.start(move, null, function* () {
                  yield all(during(5, short), during(12, long));
                  yield during(10, after);
            });
            runtime.update(8);
            expect(short.mock.calls).toEqual([[0, 0], [5, 5]]);
            expect(long.mock.calls).toEqual([[0, 0], [5, 5], [3, 8]]);
            runtime.update(10);
            expect(long.mock.calls.at(-1)).toEqual([4, 12]);
            expect(after.mock.calls).toEqual([[0, 0], [6, 6]]);
            runtime.update(4);
            expect(result.started && result.handle.state).toBe("completed");
      });

      it.each([false, true])("race advances a losing callback only to the winner boundary (reverse=%s)", reverse => {
            const { runtime } = setup();
            const loserTicks = vi.fn();
            const loserRelease = vi.fn();
            const after = vi.fn();
            const loser = resourceOperation(during(20, loserTicks), loserRelease);
            const winner = wait(5);
            runtime.start(move, null, function* () {
                  yield race(...(reverse ? [loser, winner] : [winner, loser]));
                  yield during(10, after);
            });
            runtime.update(10);
            expect(loserTicks.mock.calls).toEqual([[0, 0], [5, 5]]);
            expect(after.mock.calls).toEqual([[0, 0], [5, 5]]);
            expect(loserRelease).toHaveBeenCalledOnce();
      });

      it("nested all and race preserve partial budgets and release each branch at its own endpoint", () => {
            const releases = [vi.fn(), vi.fn(), vi.fn()];
            const operation = all(
                  race(resourceOperation(wait(5), releases[0]), resourceOperation(wait(20), releases[1])),
                  resourceOperation(wait(12), releases[2]),
            );
            const scope = new ScriptScope();
            expect(operation.start(scope)).toBe(true);
            expect(operation.advance(3)).toBe(3);
            expect(releases.map(release => release.mock.calls.length)).toEqual([0, 0, 0]);
            expect(operation.advance(7)).toBe(7);
            expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1, 0]);
            expect(operation.advance(8)).toBe(2);
            expect(operation.isComplete).toBe(true);
            scope.release();
            expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1, 1]);
      });

      it("releases partial acquisitions on rejection without committing the move cooldown", () => {
            const { runtime } = setup();
            const first = vi.fn();
            const second = vi.fn();
            const rejecting: ScriptOperation = {
                  start(scope) { scope.use(second); return false; }, advance: () => 0,
                  isComplete: false, rejectionReason: "resource-conflict", cancel: vi.fn(),
            };
            expect(runtime.start(move, null, function* () {
                  yield all(resourceOperation(wait(10), first), rejecting);
            })).toEqual({ started: false, reason: "resource-conflict" });
            expect(first).toHaveBeenCalledOnce();
            expect(second).toHaveBeenCalledOnce();
            expect(runtime.start(move, null, function* () { yield wait(1); }).started).toBe(true);
      });

      it("routes contacts only to live branches and lets a contact win a race", () => {
            const { runtime, event } = setup();
            const contacts = [vi.fn(), vi.fn()];
            let done = false;
            const collision: ScriptOperation = {
                  start: () => true, advance: delta => delta,
                  get isComplete() { return done; }, endReason: "collision", cancel: vi.fn(),
                  contact: event => { contacts[1](event); done = true; },
            };
            const timer = wait(2);
            timer.contact = contacts[0];
            runtime.start(move, null, function* () { yield all(timer, collision); });
            runtime.contact(event);
            expect(contacts.map(contact => contact.mock.calls.length)).toEqual([1, 1]);
            runtime.update(2);
            runtime.contact(event);
            expect(contacts.map(contact => contact.mock.calls.length)).toEqual([1, 1]);

            const loserCancel = vi.fn();
            done = false;
            const loser = wait(10);
            loser.cancel = loserCancel;
            const op = race(collision, loser);
            op.start(new ScriptScope());
            op.contact?.(event);
            expect(op.isComplete).toBe(true);
            expect(op.endReason).toBe("collision");
            expect(loserCancel).toHaveBeenCalledOnce();
      });

      it.each(["start", "advance", "contact", "release"] as const)("cleans all branches after a %s exception", source => {
            const { runtime, event } = setup();
            const released = [vi.fn(), vi.fn()];
            const failing: ScriptOperation = {
                  start(scope) {
                        scope.use(() => { released[1](); if (source === "release") throw new Error("failure"); });
                        if (source === "start") throw new Error("failure");
                        return true;
                  },
                  advance: delta => { if (source === "advance") throw new Error("failure"); return delta; },
                  isComplete: false, cancel: () => {},
                  contact: () => { if (source === "contact") throw new Error("failure"); },
            };
            const start = () => runtime.start(move, null, function* () {
                  yield all(resourceOperation(wait(10), released[0]), failing);
            });
            if (source === "start") expect(start).toThrow("failure");
            else {
                  start();
                  expect(() => source === "advance" ? runtime.update(1) :
                        source === "contact" ? runtime.contact(event) : runtime.cancel("interrupted")).toThrow("failure");
            }
            expect(released.map(release => release.mock.calls.length)).toEqual([1, 1]);
            expect(runtime.isRunning).toBe(false);
      });

      it.each(["start", "advance", "release"] as const)("handles reentrant cancellation in %s without starting later work", source => {
            const { runtime } = setup();
            const releases = [vi.fn(), vi.fn()];
            const later = vi.fn();
            const first = resourceOperation(during(2, delta => {
                  if (source === "start" && delta === 0 || source === "advance" && delta > 0) runtime.cancel("interrupted");
            }), () => { releases[0](); if (source === "release") runtime.cancel("interrupted"); });
            runtime.start(move, null, function* () {
                  yield all(first, resourceOperation(wait(10), releases[1]));
                  later();
            });
            runtime.update(4);
            runtime.cancel("interrupted");
            expect(releases[0]).toHaveBeenCalledOnce();
            expect(releases[1]).toHaveBeenCalledTimes(source === "start" ? 0 : 1);
            expect(later).not.toHaveBeenCalled();
      });

      it("rejects undeclared early completion, invalid consumption, zero boundaries, and duplicate instances", () => {
            for (const used of [NaN, -1, 11, 0, 2]) {
                  const release = vi.fn();
                  const invalid: ScriptOperation = {
                        start(scope) { scope.use(release); return true; },
                        advance: () => used, isComplete: false, cancel: () => {},
                  };
                  const op = race(wait(20), invalid);
                  op.start(new ScriptScope());
                  expect(() => op.advance(10)).toThrow();
                  expect(release).toHaveBeenCalledOnce();
            }
            const zero: ScriptOperation = {
                  start: () => true, advance: () => 0, isComplete: false, nextBoundaryMs: 0, cancel: () => {},
            };
            const op = all(zero);
            op.start(new ScriptScope());
            expect(() => op.advance(1)).toThrow("no progress");
            const repeated = wait(1);
            expect(() => all(repeated, repeated).start(new ScriptScope())).toThrow("distinct");
      });

      it("completes empty and immediate compositions without consuming time", () => {
            for (const operation of [all(), race(), all(wait(0), wait(0)), race(wait(0), wait(10))]) {
                  expect(operation.start(new ScriptScope())).toBe(true);
                  expect(operation.isComplete).toBe(true);
                  expect(operation.advance(10)).toBe(0);
            }
      });

      it("continues cleanup when a branch cancellation throws", () => {
            const releases = [vi.fn(), vi.fn()];
            const failing = resourceOperation(wait(10), releases[0]);
            failing.cancel = () => { throw new Error("cancel failed"); };
            const op = all(failing, resourceOperation(wait(10), releases[1]));
            const scope = new ScriptScope();
            op.start(scope);
            expect(() => op.cancel("interrupted")).toThrow("cancel failed");
            scope.release();
            expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1]);
      });

      it("handles completion of a sibling during scope release", () => {
            let done = false;
            const siblingRelease = vi.fn();
            const sibling: ScriptOperation = {
                  start(scope) { scope.use(siblingRelease); return true; },
                  advance: delta => delta, get isComplete() { return done; }, cancel: () => {},
            };
            const op = all(resourceOperation(wait(2), () => { done = true; }), sibling);
            op.start(new ScriptScope());
            expect(op.advance(10)).toBe(2);
            expect(op.isComplete).toBe(true);
            expect(siblingRelease).toHaveBeenCalledOnce();
      });

      it("does not turn a reentrant cancellation during race cleanup into completion", () => {
            let op: ScriptOperation;
            const release = vi.fn(() => op.cancel("interrupted"));
            op = race(resourceOperation(wait(2), release), wait(10));
            op.start(new ScriptScope());
            op.advance(10);
            expect(op.isComplete).toBe(false);
            expect(release).toHaveBeenCalledOnce();
      });
});
