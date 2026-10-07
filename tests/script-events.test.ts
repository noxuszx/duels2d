import { Bodies } from "matter-js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { Entity } from "../src/engine/entity";
import { SIMULATION_STEP_MS, Simulation } from "../src/engine/simulation";
import { all, OperationRunner, perform, race, scoped, ScriptScope, sequence, wait,
      waitForEvent, type EventWaitResult, type ScriptOperation } from "../src/engine/scripting";

function world() {
      return new Simulation({ arena: { minX: 0, maxX: 500, minY: 0, maxY: 500 }, seed: 4 });
}
function target(simulation: Simulation) {
      const entity = new Entity({ runtimeId: "target", configId: "target", teamId: "a",
            body: Bodies.circle(100, 100, 10, { isStatic: true }),
            config: { id: "target", radius: 10, hitbox: { type: "circle", radius: 10 }, speed: 0, maxHealth: 100 } });
      simulation.add(entity);
      return entity;
}

describe("typed simulation events", () => {
      it("delivers callbacks synchronously but prevents reentrant and emission-tick script wake-ups", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            let received: EventWaitResult<number> | undefined;
            const runner = new OperationRunner((function* () {
                  received = yield* perform(waitForEvent(source, "signal"));
            })());
            runner.drain(0);
            const immediate = vi.fn(() => runner.drain(0));
            source.on("signal", immediate);
            source.emit("signal", 7);
            expect(immediate).toHaveBeenCalledOnce();
            expect(received).toBeUndefined();
            runner.drain(SIMULATION_STEP_MS);
            expect(received).toBeUndefined();
            simulation.step();
            runner.drain(0);
            expect(received).toEqual({ kind: "event", payload: 7, stamp: { nowMs: 0, tick: 0, sequence: 1 } });
            simulation.dispose();
      });

      it("observes future matching events once and captures the earliest matching emission", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            source.emit("signal", 99);
            const operation = waitForEvent(source, "signal", { filter: value => value > 1 });
            operation.start(new ScriptScope());
            source.emit("signal", 1);
            simulation.step();
            expect(operation.isComplete).toBe(false);
            source.emit("signal", 2);
            source.emit("signal", 3);
            simulation.step();
            expect(operation.result).toMatchObject({ kind: "event", payload: 2,
                  stamp: { tick: 1, nowMs: SIMULATION_STEP_MS, sequence: 3 } });
            simulation.dispose();
      });

      it("preserves an event received before its deadline when the next tick is later than that deadline", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const operation = waitForEvent(source, "signal", { timeoutMs: 1 });
            operation.start(new ScriptScope());
            source.emit("signal", 4);
            simulation.step();
            expect(operation.result).toMatchObject({ kind: "event", payload: 4 });
            simulation.dispose();
      });

      it("resolves timeout on the simulation barrier and treats an emission at the deadline as too late", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const operation = waitForEvent(source, "signal", { timeoutMs: SIMULATION_STEP_MS });
            operation.start(new ScriptScope());
            // This publisher runs after barrier processing at exactly the timeout timestamp.
            const emitter = target(simulation);
            emitter.components.use("emit", { beforeStep() { source.emit("signal", 4); } });
            simulation.step();
            expect(operation.result).toEqual({ kind: "timeout" });
            expect(operation.endReason).toBe("timeout");
            simulation.dispose();
      });

      it("returns source closure at the next barrier, including a source closed before admission", () => {
            const simulation = world();
            const owner = target(simulation);
            const source = simulation.createEventSource<{ signal: number }>(owner);
            const operation = waitForEvent(source, "signal");
            operation.start(new ScriptScope());
            owner.takeDamage(100);
            expect(source.isClosed).toBe(true);
            expect(operation.isComplete).toBe(false);
            const afterClosure = waitForEvent(source, "signal");
            afterClosure.start(new ScriptScope());
            simulation.step();
            expect(operation.result).toEqual({ kind: "source-closed" });
            expect(afterClosure.result).toEqual({ kind: "source-closed" });
            simulation.dispose();
      });

      it("drops staged results on cancellation and cancels losing race subscriptions", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const cancelled = waitForEvent(source, "signal");
            const scope = new ScriptScope();
            cancelled.start(scope);
            source.emit("signal", 2);
            scope.release();
            const filter = vi.fn(() => true);
            const competition = race(wait(1), waitForEvent(source, "signal", { filter }));
            competition.start(new ScriptScope());
            competition.advance(1);
            expect(competition.result).toEqual({ index: 0, result: undefined });
            source.emit("signal", 3);
            simulation.step();
            expect(cancelled.isComplete).toBe(false);
            expect(filter).not.toHaveBeenCalled();
            simulation.dispose();
      });

      it("isolates a failing wait filter from the publisher, then fails its script at the barrier", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const failure = new Error("filter failed");
            const runner = new OperationRunner((function* () {
                  yield waitForEvent(source, "signal", { filter: () => { throw failure; } });
            })());
            runner.drain(0);
            expect(() => source.emit("signal", 2)).not.toThrow();
            simulation.step();
            expect(() => runner.drain(0)).toThrow(failure);
            simulation.dispose();
      });

      it("finishes notification and closure cleanup after callback failures", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const failure = new Error("observer failed");
            const later = vi.fn();
            source.on("signal", () => { throw failure; });
            source.on("signal", later);
            expect(() => source.emit("signal", 2)).toThrow(failure);
            expect(later).toHaveBeenCalledOnce();
            source.onClose(() => { throw failure; });
            const closed = vi.fn();
            source.onClose(closed);
            expect(() => source.close()).toThrow(failure);
            expect(closed).toHaveBeenCalledOnce();
            expect(source.isClosed).toBe(true);
            simulation.dispose();
      });

      it("honors unsubscribe during close delivery even when the first observer throws", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const skipped = vi.fn();
            const later = vi.fn();
            const failure = new Error("close observer failed");
            let unsubscribe = () => {};
            source.onClose(() => { unsubscribe(); throw failure; });
            unsubscribe = source.onClose(skipped);
            source.onClose(later);
            expect(() => source.close()).toThrow(failure);
            expect(skipped).not.toHaveBeenCalled();
            expect(later).toHaveBeenCalledOnce();
            source.close();
            expect(later).toHaveBeenCalledOnce();
            simulation.dispose();
      });

      it("detaches event and close cleanup registrations on early unsubscribe and source closure", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const scope = new ScriptScope();
            const register = scope.add.bind(scope);
            let retained = 0;
            vi.spyOn(scope, "add").mockImplementation(cleanup => {
                  retained++;
                  const detach = register(cleanup);
                  let active = true;
                  return () => {
                        if (active) retained--;
                        active = false;
                        detach();
                  };
            });
            const callback = vi.fn();
            for (let index = 0; index < 100; index++) {
                  const off = source.on("signal", callback, scope);
                  const offClose = source.onClose(callback, scope);
                  off(); off(); offClose(); offClose();
            }
            expect(retained).toBe(0);
            source.emit("signal", 1);
            expect(callback).not.toHaveBeenCalled();
            source.on("signal", callback, scope);
            source.onClose(callback, scope);
            expect(retained).toBe(2);
            source.close();
            expect(retained).toBe(0);
            expect(callback).toHaveBeenCalledOnce();
            scope.release();
            expect(callback).toHaveBeenCalledOnce();
            simulation.dispose();
      });

      it("clears pending event delivery and closes custom sources on reset", () => {
            const simulation = world();
            const source = simulation.createEventSource<{ signal: number }>();
            const operation = waitForEvent(source, "signal");
            operation.start(new ScriptScope());
            source.emit("signal", 2);
            simulation.reset();
            simulation.step();
            expect(source.isClosed).toBe(true);
            expect(operation.isComplete).toBe(false);
            simulation.dispose();
      });

      it("finishes reset even when an entity removal observer throws", () => {
            const simulation = world();
            const entity = target(simulation);
            const source = simulation.createEventSource<{ signal: number }>();
            const operation = waitForEvent(source, "signal");
            operation.start(new ScriptScope());
            source.emit("signal", 2);
            entity.events.on("removed", () => { throw new Error("removal failed"); });
            expect(() => simulation.reset()).toThrow("removal failed");
            expect(simulation.entities.all()).toEqual([]);
            expect(source.isClosed).toBe(true);
            simulation.step();
            expect(operation.isComplete).toBe(false);
            simulation.dispose();
      });
});

describe("script operation results", () => {
      it("rejects premature value reads and permits an explicit undefined result", () => {
            const sequenceOperation = sequence(function* () { yield wait(1); return 42; });
            const combined = all(sequenceOperation);
            expect(() => sequenceOperation.result).toThrow("before completion");
            expect(() => combined.result).toThrow("before completion");
            combined.start(new ScriptScope());
            expect(() => sequenceOperation.result).toThrow("before completion");
            combined.advance(1);
            expect(combined.result).toEqual([42]);
            expect(sequenceOperation.result).toBe(42);
            const runner = new OperationRunner((function* () { yield wait(1); return undefined; })());
            expect(() => runner.result).toThrow("before completion");
            runner.drain(1);
            expect(runner.isComplete).toBe(true);
            expect(runner.result).toBeUndefined();
            const simulation = world();
            const eventWait = waitForEvent(simulation.createEventSource<{ signal: number }>(), "signal");
            expect(() => eventWait.result).toThrow("before completion");
            simulation.dispose();
      });

      it("rejects empty races at runtime while accepting empty all", () => {
            expect(() => Reflect.apply(race, undefined, [])).toThrow("at least one branch");
            const operation = all();
            expect(operation.start(new ScriptScope())).toBe(true);
            expect(operation.isComplete).toBe(true);
            expect(operation.result).toEqual([]);
      });

      it("reads only the winning race result once and cancels other finished branches", () => {
            let reads = 0;
            const immediate: ScriptOperation = {
                  start: () => true, advance: () => 0, isComplete: true, cancel: () => {},
            };
            const winner: ScriptOperation<number> = { ...immediate, get result() { reads++; return 7; } };
            const cancelled = vi.fn();
            const loser: ScriptOperation<string> = {
                  ...immediate, get result(): string { throw new Error("Losing result must not be read"); }, cancel: cancelled,
            };
            const operation = race(winner, loser);
            expect(operation.start(new ScriptScope())).toBe(true);
            expect(operation.result).toEqual({ index: 0, result: 7 });
            expect(reads).toBe(1);
            expect(cancelled).toHaveBeenCalledExactlyOnceWith("interrupted");
      });

      it("releases every branch when a completed value getter fails, preserving the getter error", () => {
            const failure = new Error("result failed");
            const released = vi.fn(() => { throw new Error("cleanup failed"); });
            const siblingReleased = vi.fn();
            const broken: ScriptOperation<number> = {
                  start(scope) { scope.add(released); return true; },
                  advance: deltaMs => deltaMs, isComplete: true,
                  get result(): number { throw failure; }, cancel: () => {},
            };
            const sibling: ScriptOperation = {
                  start(scope) { scope.add(siblingReleased); return true; },
                  advance: deltaMs => deltaMs, isComplete: false, cancel: () => {},
            };
            expect(() => all(broken, sibling).start(new ScriptScope())).toThrow(failure);
            expect(released).toHaveBeenCalledOnce();
            expect(siblingReleased).toHaveBeenCalledOnce();
      });

      it("passes typed results through perform, scoped sequences, all and race", () => {
            const release = vi.fn();
            const numbers = () => sequence(function* () {
                  return yield* scoped(() => release, function* () { yield wait(1); return 12; });
            });
            let observed: unknown;
            const runner = new OperationRunner((function* () {
                  const values = yield* perform(all(numbers(), sequence(function* () { yield wait(2); return "done"; })));
                  expectTypeOf(values).toEqualTypeOf<readonly [number, string]>();
                  const winner = yield* perform(race(wait(10), numbers()));
                  if (winner.index === 1) expectTypeOf(winner.result).toEqualTypeOf<number>();
                  observed = { values, winner };
                  return "finished";
            })());
            runner.drain(20);
            expect(observed).toEqual({ values: [12, "done"], winner: { index: 1, result: 12 } });
            expect(runner.result).toBe("finished");
            expect(release).toHaveBeenCalledTimes(2);
      });

      it("supports an immediately returning sequence", () => {
            const runner = new OperationRunner((function* () {
                  return yield* perform(sequence(function* () { return 42; }));
            })());
            runner.drain(0);
            expect(runner.isComplete).toBe(true);
            expect(runner.result).toBe(42);
      });
});

describe("detachable scope registrations", () => {
      it("deduplicates resources even when they are reused after scope closure", () => {
            const scope = new ScriptScope();
            const release = vi.fn();
            scope.use(release);
            scope.use(release);
            scope.release();
            scope.use(release);
            expect(release).toHaveBeenCalledOnce();
      });

      it("unregisters cleanup without running it, retaining reverse order for active registrations", () => {
            const scope = new ScriptScope();
            const calls: number[] = [];
            const detach = scope.add(() => calls.push(1));
            scope.add(() => calls.push(2));
            scope.add(() => calls.push(3));
            detach(); detach();
            expect(calls).toEqual([]);
            scope.release(); scope.release();
            expect(calls).toEqual([3, 2]);
      });

      it("allows cleanup to detach a later registration during release", () => {
            const scope = new ScriptScope();
            const skipped = vi.fn();
            const detach = scope.add(skipped);
            scope.add(detach);
            scope.release();
            expect(skipped).not.toHaveBeenCalled();
      });
});

describe("entity damage publication", () => {
      it("publishes direct and combat damage once even when presentation events are drained or health is healed", () => {
            const simulation = world();
            const entity = target(simulation);
            const observed: number[] = [];
            entity.events.on("damaged", event => observed.push(event.amount), entity.lifetime);
            entity.takeDamage(3);
            entity.heal(3);
            expect(simulation.events.splice(0)).toMatchObject([{ kind: "damage", amount: 3, sourceId: null }]);
            simulation.combat.damage(entity, 5, { sourceId: "attacker" });
            expect(observed).toEqual([3, 5]);
            expect(simulation.events).toMatchObject([{ kind: "damage", amount: 5, sourceId: "attacker" }]);
            simulation.dispose();
      });

      it("commits combat cooldown before a synchronous observer can reenter combat", () => {
            const simulation = world();
            const entity = target(simulation);
            entity.events.on("damaged", () => simulation.combat.damage(entity, 1));
            simulation.combat.damage(entity, 5);
            expect(entity.health).toBe(95);
            simulation.dispose();
      });

      it("preserves damage, death, removal ordering and cleanup on reentrant removal and throwing observers", () => {
            const simulation = world();
            const entity = target(simulation);
            const events: string[] = [];
            const failure = new Error("damage observer failed");
            entity.events.on("damaged", () => {
                  events.push("damaged");
                  simulation.remove(entity.runtimeId);
                  throw failure;
            });
            entity.events.on("death", () => events.push("death"));
            entity.events.on("removed", () => events.push("removed"));
            const released = vi.fn();
            entity.lifetime.add(released);
            expect(() => entity.takeDamage(100)).toThrow(failure);
            expect(events).toEqual(["damaged", "death", "removed"]);
            expect(entity.events.isClosed).toBe(true);
            expect(released).toHaveBeenCalledOnce();
            simulation.dispose();
      });
});
