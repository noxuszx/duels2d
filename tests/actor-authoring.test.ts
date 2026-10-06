import { Bodies, Composite } from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { createEntity } from "../src/engine/entity-factory";
import type { ComponentContext } from "../src/engine/component";
import { Simulation, SIMULATION_STEP_MS } from "../src/engine/simulation";
import { scoped, wait, type ScriptOperation } from "../src/engine/scripting";
import { spawnActor } from "../src/gameplay/actor-factory";
import { installBehavior } from "../src/gameplay/behavior";

const config = { id: "probe", radius: 5, hitbox: { type: "circle" as const, radius: 5 },
      speed: 0, maxHealth: 10 };
function body() { return Bodies.circle(100, 100, 5, { isStatic: true, collisionFilter: { mask: 0 } }); }
function setup() {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 500, minY: 0, maxY: 500 }, seed: 7 });
      const entity = createEntity(simulation, { runtimeId: "owner", configId: config.id,
            teamId: "A", body: body(), config, tags: [] });
      const owner: ComponentContext = { entity, simulation, get config() { return entity.config; } };
      return { simulation, owner };
}
function advance(simulation: Simulation, ticks = 1) { for (let i = 0; i < ticks; i++) simulation.step(); }

describe("actor authoring", () => {
      it("runs once with actor context alongside the owner's task and starts without charging the spawn tick", () => {
            const { simulation, owner } = setup();
            let ownerDone = false, actorDone = false, received: ComponentContext | undefined;
            installBehavior(owner, { *onSpawn() { yield wait(SIMULATION_STEP_MS); ownerDone = true; } },
                  { onSpawn: "owner-task" }, () => ({ cooldownMs: 0 }));
            const actor = spawnActor(owner, { config, body: body(), removeOnComplete: false }, function* (context) {
                  received = context;
                  yield wait(SIMULATION_STEP_MS);
                  actorDone = true;
            });
            expect(received).toBeUndefined();
            simulation.step();
            expect(received!.entity).toBe(actor);
            expect(received!.simulation).toBe(simulation);
            expect(received!.config).toBe(actor.config);
            expect(ownerDone || actorDone).toBe(false);
            simulation.step();
            expect(ownerDone && actorDone).toBe(true);
            expect(actor.isRemoved).toBe(false);
            advance(simulation, 3);
            expect(simulation.trace.filter(event => event.entityId === actor.runtimeId && event.kind === "admitted")).toHaveLength(1);
            simulation.dispose();
      });

      it("allocates distinct identities, defaults to non-targetable owned actors, and accepts overrides", () => {
            const { simulation, owner } = setup();
            const first = spawnActor(owner, { config, body: body() }, function* () { yield wait(100); });
            const second = spawnActor(owner, { config, body: body(), teamId: "B", ownerId: null,
                  tags: ["targetable"], containWithinArena: false }, function* () { yield wait(100); });
            expect(first.runtimeId).not.toBe(second.runtimeId);
            expect(first.ownerId).toBe(owner.entity.runtimeId);
            expect(first.teamId).toBe("A");
            expect(first.tags.size).toBe(0);
            expect(second.ownerId).toBeNull();
            expect(second.teamId).toBe("B");
            expect(second.tags.has("targetable")).toBe(true);
            expect(second.containWithinArena).toBe(false);
            simulation.dispose();
      });

      it("removes completed and empty scripts, but keeps explicitly retained actors", () => {
            const { simulation, owner } = setup();
            const empty = spawnActor(owner, { config, body: body() }, function* () {});
            const finite = spawnActor(owner, { config, body: body() }, function* () { yield wait(1); });
            const retained = spawnActor(owner, { config, body: body(), removeOnComplete: false }, function* () {});
            advance(simulation, 2);
            expect(empty.isRemoved).toBe(true);
            expect(finite.isRemoved).toBe(true);
            expect(retained.isRemoved).toBe(false);
            expect(Composite.allBodies(simulation.engine.world)).toHaveLength(2);
            simulation.dispose();
      });

      it("defers a child spawned during a tick until the next step", () => {
            const { simulation, owner } = setup();
            let started = false;
            spawnActor(owner, { config, body: body() }, function* (parent) {
                  spawnActor(parent, { config, body: body() }, function* () { started = true; yield wait(100); });
                  yield wait(100);
            });
            simulation.step();
            expect(started).toBe(false);
            simulation.step();
            expect(started).toBe(true);
            simulation.dispose();
      });

      it.each(["death", "removal", "reset", "match"])("retires on %s and releases scopes once", event => {
            const { simulation, owner } = setup();
            let released = 0, completed = false;
            const actor = spawnActor(owner, { config, body: body() }, function* () {
                  yield* scoped(() => () => { released++; }, function* () { yield wait(1000); });
                  completed = true;
            });
            simulation.step();
            if (event === "death") { owner.entity.takeDamage(10); simulation.step(); }
            if (event === "removal") simulation.remove(owner.entity.runtimeId);
            if (event === "reset") simulation.reset();
            if (event === "match") simulation.entities.retireMatchEnd();
            expect(actor.isRemoved).toBe(true);
            expect(released).toBe(1);
            expect(completed).toBe(false);
            simulation.dispose();
            expect(released).toBe(1);
      });

      it("honors lifetime persistence and does not restart an interrupted script", () => {
            const { simulation, owner } = setup();
            let started = 0;
            const actor = spawnActor(owner, { config, body: body(),
                  lifetime: { ownerDeath: "persist", ownerRemoval: "persist", matchEnd: "persist" } },
            function* () { started++; yield wait(1000); });
            simulation.step();
            actor.statuses.apply({ id: "stun", durationMs: 10 });
            simulation.remove(owner.entity.runtimeId);
            simulation.entities.retireMatchEnd();
            advance(simulation, 10);
            expect(actor.isRemoved).toBe(false);
            expect(actor.behavior!.isRunning).toBe(false);
            expect(started).toBe(1);
            simulation.dispose();
      });

      it("applies match-end policies at the recorded result while persistent scripts continue", () => {
            const { simulation, owner } = setup();
            for (const teamId of ["A", "B"]) createEntity(simulation, {
                  runtimeId: `contestant-${teamId}`, configId: config.id, teamId, config, body: body(),
            });
            const removed = spawnActor(owner, { config, body: body() }, function* () { yield wait(1000); });
            const persistent = spawnActor(owner, { config, body: body(), lifetime: { matchEnd: "persist" } },
                  function* () { yield wait(1000); });
            simulation.step();
            simulation.entities.get("contestant-A")!.takeDamage(10);
            simulation.step();
            expect(simulation.state).toBe("ended");
            expect(removed.removalReason).toBe("match-ended");
            expect(persistent.isRemoved).toBe(false);
            simulation.step();
            expect(persistent.behavior!.isRunning).toBe(true);
            simulation.dispose();
      });

      it.each(["generator", "operation"])("removes an actor after an unhandled %s error", kind => {
            const { simulation, owner } = setup();
            const failure = new Error("script failed");
            const operation: ScriptOperation = {
                  isComplete: false, start: () => true,
                  advance() { throw failure; }, cancel() {},
            };
            const actor = spawnActor(owner, { config, body: body() }, function* () {
                  if (kind === "generator") throw failure;
                  yield operation;
            });
            if (kind === "operation") simulation.step();
            expect(() => simulation.step()).toThrow(failure);
            expect(actor.isRemoved).toBe(true);
            expect(simulation.entities.get(actor.runtimeId)).toBeNull();
            expect(Composite.allBodies(simulation.engine.world)).toHaveLength(1);
            simulation.dispose();
      });

      it("cleans failed installations and preserves their error even when cleanup throws", () => {
            const { simulation, owner } = setup();
            const failure = new Error("installation failed");
            expect(() => spawnActor(owner, { config, body: body(), install(actor) {
                  actor.entity.components.use("probe", { detach() { throw new Error("cleanup failed"); } });
                  throw failure;
            } }, function* () {})).toThrow(failure);
            expect(simulation.entities.all()).toHaveLength(1);
            expect(Composite.allBodies(simulation.engine.world)).toHaveLength(1);
            simulation.dispose();
      });

      it("rolls back failed registration and does not remove an existing entity on duplicate identity", () => {
            const { simulation, owner } = setup();
            expect(() => createEntity(simulation, { runtimeId: "owner", configId: config.id,
                  teamId: "A", body: body(), config })).toThrow(/Duplicate/);
            expect(owner.entity.isRemoved).toBe(false);
            const add = simulation.add.bind(simulation);
            const failure = new Error("registration failed");
            const spy = vi.spyOn(simulation, "add").mockImplementation((entity, lifetime) => {
                  add(entity, lifetime); throw failure;
            });
            expect(() => spawnActor(owner, { config, body: body() }, function* () {})).toThrow(failure);
            expect(simulation.entities.all()).toHaveLength(1);
            expect(Composite.allBodies(simulation.engine.world)).toHaveLength(1);
            spy.mockRestore();
            simulation.dispose();
      });
});
