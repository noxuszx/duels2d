import * as Matter from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import type { ContactEvent } from "../src/engine/contracts";
import { Entity } from "../src/engine/entity";
import type { ScriptOperation } from "../src/engine/scripting/operation";
import { wait } from "../src/engine/scripting/wait";
import type { FighterConfig } from "../src/types/fighter";

const config = {
      id: "fixture", maxHealth: 100, defaultFacing: "right", image: null,
} as FighterConfig;

function setup() {
      const owner = new Entity({
            runtimeId: "owner:1", configId: "fixture", teamId: "a",
            body: Matter.Bodies.circle(0, 0, 10), config,
      });
      const enemy = new Entity({
            runtimeId: "enemy:1", configId: "fixture", teamId: "b",
            body: Matter.Bodies.circle(100, 0, 10), config,
      });
      const roster = [owner, enemy];
      let now = 0;
      let active = true;
      const runtime = new BehaviorRuntime(owner, {
            now: () => now,
            entities: () => roster,
            isCombatActive: () => active,
      });
      owner.setBehavior(runtime);
      return {
            owner, enemy, roster, runtime,
            setNow: (value: number) => { now = value; },
            endCombat: () => { active = false; },
      };
}

const move = { id: "charge", cooldownMs: 100 };

describe("foreground task admission and lifecycle", () => {
      it("does not spend cooldown for a no-op or rejected first operation", () => {
            const { enemy, runtime } = setup();
            expect(runtime.start(move, enemy, function* () {})).toEqual({ started: false, reason: "noop" });
            const rejected: ScriptOperation = {
                  start: () => false,
                  advance: () => 0,
                  isComplete: false,
                  rejectionReason: "resource-conflict",
                  cancel: vi.fn(),
            };
            expect(runtime.start(move, enemy, function* () { yield rejected; }))
                  .toEqual({ started: false, reason: "resource-conflict" });
            expect(runtime.start(move, enemy, function* () { yield wait(10); }).started).toBe(true);
      });

      it("rejects a recursive start during generator construction", () => {
            const { enemy, runtime } = setup();
            let nested: ReturnType<typeof runtime.start> | null = null;
            const outer = runtime.start(move, enemy, () => {
                  nested = runtime.start(move, enemy, function* () { yield wait(1); });
                  return (function* () { yield wait(1); })();
            });
            expect(nested).toEqual({ started: false, reason: "busy" });
            expect(outer.started).toBe(true);
      });

      it("carries leftover tick time, retains cooldown on interrupt, and never resumes cancellation", () => {
            const { owner, enemy, runtime, setNow } = setup();
            const next = vi.fn();
            const result = runtime.start(move, enemy, function* () {
                  yield wait(5);
                  yield wait(10);
                  next();
            });
            expect(result.started).toBe(true);
            owner.beforeStep(12);
            expect(next).not.toHaveBeenCalled();
            runtime.cancel("interrupted");
            owner.beforeStep(20);
            expect(next).not.toHaveBeenCalled();
            setNow(99);
            expect(runtime.start(move, enemy, function* () { yield wait(1); }))
                  .toEqual({ started: false, reason: "cooldown" });
            setNow(100);
            expect(runtime.start(move, enemy, function* () { yield wait(1); }).started).toBe(true);
      });

      it("preserves pre-contact task and policy snapshots when contact completes the operation", () => {
            const { owner, enemy, runtime } = setup();
            const release = owner.resources.acquireContactPolicy({ allowImpactDamage: false });
            let complete = false;
            const operation: ScriptOperation = {
                  start: scope => { scope.add(release); return true; },
                  advance: deltaMs => deltaMs,
                  get isComplete() { return complete; },
                  contact: () => { complete = true; },
                  cancel: vi.fn(),
            };
            runtime.start(move, enemy, function* () { yield operation; });
            const event: ContactEvent = {
                  kind: "wall", self: owner, wall: "left", normal: { x: 1, y: 0 },
                  incomingSpeed: 2, policy: owner.resources.contactPolicy,
                  hadForegroundTask: false,
            };
            owner.contact(event);
            expect(event.hadForegroundTask).toBe(true);
            expect(event.policy.allowImpactDamage).toBe(false);
            expect(owner.resources.contactPolicy.allowImpactDamage).toBe(true);
            expect(runtime.isRunning).toBe(false);
      });

      it("detaches components once and rejects further work after removal", () => {
            const { owner, enemy, runtime } = setup();
            const attach = vi.fn();
            const detach = vi.fn();
            const beforeStep = vi.fn();
            owner.components.use("probe", { attach, beforeStep, detach });
            owner.beforeStep(1);
            owner.remove("owner-removed");
            owner.remove("owner-removed");
            owner.beforeStep(1);
            expect(attach).toHaveBeenCalledOnce();
            expect(beforeStep).toHaveBeenCalledOnce();
            expect(detach).toHaveBeenCalledOnce();
            expect(runtime.start(move, enemy, function* () { yield wait(1); }))
                  .toEqual({ started: false, reason: "inactive" });
      });

      it("releases every component and lease when one detach callback fails", () => {
            const { owner } = setup();
            const calls: string[] = [];
            owner.components.use("first", { detach: () => { calls.push("first"); } });
            owner.components.use("second", {
                  detach: () => { calls.push("second"); throw new Error("cleanup failed"); },
            });
            const release = owner.resources.acquireExclusive("locomotion");
            expect(release).not.toBeNull();
            expect(() => owner.remove()).toThrow("cleanup failed");
            expect(calls).toEqual(["second", "first"]);
            expect(owner.isRemoved).toBe(true);
            expect(owner.resources.isHeld("locomotion")).toBe(false);
      });
});

describe("status modules", () => {
      it("interrupts an active task on stun and expires on simulation time", () => {
            const { owner, enemy, runtime } = setup();
            const result = runtime.start(move, enemy, function* () { yield wait(100); });
            expect(result.started).toBe(true);
            expect(owner.statuses.apply({ id: "stun", durationMs: 50 }).applied).toBe(true);
            expect(runtime.isRunning).toBe(false);
            expect(owner.statuses.canStartCast).toBe(false);
            owner.beforeStep(49);
            expect(owner.statuses.canStartCast).toBe(false);
            owner.beforeStep(1);
            expect(owner.statuses.canStartCast).toBe(true);
      });

      it("routes periodic burn damage through the injected combat handler", () => {
            const { owner } = setup();
            const damage = vi.fn();
            owner.setPeriodicDamageHandler(damage);
            owner.statuses.apply({ id: "burn", durationMs: 1_200, sourceId: "attacker" });
            owner.beforeStep(1_200);
            expect(damage).toHaveBeenCalledTimes(2);
            expect(damage).toHaveBeenCalledWith(owner, 2, "attacker");
            expect(owner.statuses.list()).toHaveLength(0);
      });

      it("caps burn stacks and refreshes duration without a wall-clock timer", () => {
            const { owner } = setup();
            const damage = vi.fn();
            owner.setPeriodicDamageHandler(damage);
            owner.statuses.apply({ id: "burn", durationMs: 500 });
            owner.beforeStep(250);
            owner.statuses.apply({ id: "burn", durationMs: 500 });
            owner.statuses.apply({ id: "burn", durationMs: 500 });
            owner.statuses.apply({ id: "burn", durationMs: 500 });
            expect(owner.statuses.list()[0].stacks).toBe(3);
            owner.beforeStep(250);
            expect(damage).toHaveBeenCalledWith(owner, 6, null);
            owner.beforeStep(250);
            expect(owner.statuses.list()).toHaveLength(0);
      });

      it("fires and expires a 500ms burn at exactly 60 fixed 120Hz ticks", () => {
            const { owner } = setup();
            const damage = vi.fn();
            owner.setPeriodicDamageHandler(damage);
            owner.statuses.apply({ id: "burn", durationMs: 500 });
            for (let tick = 0; tick < 60; tick++) owner.beforeStep(1_000 / 120);
            expect(damage).toHaveBeenCalledOnce();
            expect(owner.statuses.list()).toHaveLength(0);
      });
});
