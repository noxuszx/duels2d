import { Bodies, Body } from "matter-js";
import { describe, expect, it } from "vitest";
import { Entity } from "../src/engine/entity";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import { steer } from "../src/content/script-helpers/steer";
import { moveTo } from "../src/content/script-helpers/move-to";
import { race } from "../src/engine/scripting/race";
import { wait } from "../src/engine/scripting/wait";

function fixture(isStatic = false) {
      const entity = new Entity({ runtimeId: "actor", configId: "actor", teamId: "A",
            config: { id: "actor", maxHealth: 1 }, body: Bodies.circle(10, 20, 5, { isStatic }) });
      const runtime = new BehaviorRuntime(entity, {
            now: () => 0, entities: () => [entity], isCombatActive: () => true,
      });
      entity.setBehavior(runtime);
      return { entity, runtime };
}
const move = { id: "move", cooldownMs: 100 };

describe("content steering helpers", () => {
      it("commands velocity while leaving position to physics and releases control on interruption", () => {
            const { entity, runtime } = fixture();
            runtime.start(move, null, function* () {
                  yield steer(entity, 100, elapsedMs => ({ x: elapsedMs / 10, y: 2 }));
            });
            runtime.update(20);
            expect(entity.body.velocity).toEqual({ x: 2, y: 2 });
            expect(entity.body.position).toEqual({ x: 10, y: 20 });
            expect(entity.resources.isHeld("locomotion")).toBe(true);
            runtime.cancel("interrupted");
            expect(entity.body.velocity).toEqual({ x: 0, y: 0 });
            expect(entity.resources.isHeld("locomotion")).toBe(false);
      });

      it("rejects conflicting movement without changing velocity or committing cooldown", () => {
            const { entity, runtime } = fixture();
            const release = entity.resources.acquireExclusive("locomotion")!;
            Body.setVelocity(entity.body, { x: 3, y: 4 });
            const run = () => runtime.start(move, null, function* () {
                  yield steer(entity, 10, () => ({ x: 20, y: 0 }));
            });
            expect(run()).toEqual({ started: false, reason: "resource-conflict" });
            expect(entity.body.velocity).toEqual({ x: 3, y: 4 });
            release();
            expect(run().started).toBe(true);
            runtime.cancel("removed");
      });

      it("does not apply a command after its velocity callback cancels the task", () => {
            const { entity, runtime } = fixture();
            runtime.start(move, null, function* () {
                  yield steer(entity, 100, elapsedMs => {
                        if (elapsedMs > 0) runtime.cancel("interrupted");
                        return { x: 50, y: 0 };
                  });
            });
            runtime.update(10);
            expect(entity.body.velocity).toEqual({ x: 0, y: 0 });
            expect(entity.resources.isHeld("locomotion")).toBe(false);
      });

      it("captures a static actor's start position at admission and stops exactly at a race boundary", () => {
            const { entity, runtime } = fixture(true);
            const operation = moveTo(entity, { x: 100, y: 50 }, 100);
            Body.setPosition(entity.body, { x: 20, y: 10 });
            runtime.start(move, null, function* () { yield race(operation, wait(25)); });
            runtime.update(40);
            expect(entity.body.position).toEqual({ x: 40, y: 20 });
            expect(runtime.isRunning).toBe(false);
            expect(entity.resources.isHeld("locomotion")).toBe(false);
      });

      it("finishes a kinematic path without an extra tick and protects dynamic bodies from teleport steering", () => {
            const { entity, runtime } = fixture(true);
            runtime.start(move, null, function* () { yield moveTo(entity, { x: 50, y: 70 }, 10); });
            runtime.update(15);
            expect(entity.body.position).toEqual({ x: 50, y: 70 });
            expect(entity.resources.isHeld("locomotion")).toBe(false);
            const dynamic = fixture();
            expect(dynamic.runtime.start(move, null, function* () {
                  yield moveTo(dynamic.entity, { x: 50, y: 70 }, 10);
            })).toEqual({ started: false, reason: "rejected" });
      });
});
