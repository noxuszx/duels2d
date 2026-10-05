import { Bodies, Body } from "matter-js";
import { describe, expect, it } from "vitest";
import type { ProjectileEmitterSettings } from "../src/config/component-settings";
import type { RuntimeConfig } from "../src/config/runtime-config";
import { Entity } from "../src/engine/entity";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import { Simulation } from "../src/engine/simulation";
import { scoped } from "../src/engine/scripting/scoped";
import { wait } from "../src/engine/scripting/wait";
import { SpriteAim } from "../src/gameplay/components/aim";
import { ProjectileEmitter } from "../src/gameplay/components/projectile";
import { CanvasRenderer } from "../src/presentation/canvas-renderer";
import { entityView, viewChildTransform, viewRootTransform } from "../src/presentation/view";
import { transformPoint } from "../src/presentation/transform";
import type { EntityConfig } from "../src/types/entity";

function fixture() {
      const config: EntityConfig = { id: "aim", maxHealth: 100, speed: 0, radius: 10,
            hitbox: { type: "circle", radius: 10 }, hitboxOffset: { x: 3, y: -4 },
            defaultFacing: "left", image: null, imageScale: 1, imageOffset: { x: 5, y: 7 },
            poses: { fire: { image: "", imageOffset: { x: -2, y: 6 },
                  aim: { muzzle: { x: -24, y: 5 }, pivot: { x: -6, y: 2 } } } },
      };
      const simulation = new Simulation({ arena: { minX: 0, maxX: 500, minY: 0, maxY: 400 }, seed: 7 });
      const owner = new Entity({ runtimeId: "owner", configId: "owner", teamId: "A", config,
            body: Bodies.circle(100, 100, 10) });
      const target = new Entity({ runtimeId: "target", configId: "target", teamId: "B", config,
            body: Bodies.circle(300, 190, 10) });
      simulation.add(owner); simulation.add(target);
      const context = { entity: owner, simulation, get config() { return owner.config; } };
      const aim = owner.components.use("aim", new SpriteAim(context,
            { muzzle: { x: -20, y: 3 }, pivot: { x: -4, y: 1 } }));
      const settings: ProjectileEmitterSettings = { recoil: .12, projectile: { radius: 2, speed: 10, damage: 5,
            flight: { collision: { response: "sensor", enemyContact: "consume", ownerContact: "ignore", walls: "ignore" },
                  lifetime: { type: "duration", durationMs: 1000 },
                  ownership: { onOwnerDeath: "remove", onOwnerRemoval: "remove", onMatchEnd: "remove" } } } };
      const emitter = new ProjectileEmitter(context, settings);
      return { config, owner, target, simulation, aim, emitter };
}

describe("owner-bound sprite aim", () => {
      it("stays inert until tracked and fires from the mirrored, moving pose's muzzle", () => {
            const { owner, target, simulation, aim, emitter } = fixture();
            expect(aim.current).toBeNull();
            expect(owner.presentation.orientation("sprite")).toBeNull();
            const release = aim.track(target)!;
            expect(owner.facing).toBe("right");
            const releasePose = owner.presentation.acquirePose("fire");
            Body.setPosition(owner.body, { x: 110, y: 120 });
            Body.setPosition(target.body, { x: 280, y: 230 });
            const solution = aim.current!;
            expect(solution.localPivot).toEqual({ x: -6, y: 2 });
            expect(solution.pivot).toEqual({ x: 111, y: 132 });
            const dx = target.body.position.x - solution.origin.x, dy = target.body.position.y - solution.origin.y;
            expect(dx * solution.direction.y - dy * solution.direction.x).toBeCloseTo(0, 8);
            expect(dx * solution.direction.x + dy * solution.direction.y).toBeGreaterThan(0);
            const shot = emitter.spawn({ position: solution.origin, direction: solution.direction })![0];
            expect(shot.body.position.x).toBeCloseTo(solution.origin.x);
            expect(shot.body.position.y).toBeCloseTo(solution.origin.y);
            expect(shot.body.velocity.x).toBeCloseTo(solution.direction.x * 10);
            expect(shot.body.velocity.y).toBeCloseTo(solution.direction.y * 10);
            expect(owner.body.force.x * solution.direction.x + owner.body.force.y * solution.direction.y).toBeLessThan(0);
            expect(owner.body.force.x * solution.direction.y - owner.body.force.y * solution.direction.x).toBeCloseTo(0);
            releasePose(); release();
            expect(aim.current).toBeNull();
            expect(owner.presentation.orientation("sprite")).toBeNull();
            simulation.dispose();
      });

      it("draws using the same mirrored pivot transform that determines the muzzle", () => {
            const { owner, target, simulation, aim } = fixture();
            aim.track(target);
            owner.presentation.acquirePose("fire");
            const solution = aim.current!;
            const calls: Array<[string, ...number[]]> = [];
            const ctx = { clearRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {},
                  beginPath() {}, arc() {}, fill() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, closePath() {},
                  measureText: () => ({ width: 80 }),
                  transform: (...values: number[]) => calls.push(["transform", ...values]),
            } as unknown as CanvasRenderingContext2D;
            const renderer = new CanvasRenderer(ctx, { game: { arena: { borderColor: "", borderWidth: 1 },
                  text: { footer: "" } } } as RuntimeConfig);
            renderer.render(500, 400, { ax: 0, ay: 0, aw: 500, ah: 400 },
                  [{ ...entityView(owner), showHealth: false }], 0);
            const transform = viewChildTransform(entityView(owner), "sprite");
            expect(calls).toEqual([["transform", transform.a, transform.b, transform.c, transform.d, transform.e, transform.f]]);
            const muzzle = transformPoint(transform, { x: -24, y: 5 });
            expect(muzzle.x).toBeCloseTo(solution.origin.x);
            expect(muzzle.y).toBeCloseTo(solution.origin.y);
            simulation.dispose();
      });

      it("uses visual overrides and live form data, invalidates dead targets, and restores leases", () => {
            const { owner, target, config, simulation, aim, emitter } = fixture();
            const previous = owner.presentation.acquireOrientation("sprite", { angle: 0.4, pivot: { x: 1, y: 2 } });
            const release = aim.track(target)!;
            const visual = owner.presentation.acquireVisual({ image: "", imageOffset: { x: 1, y: 2 },
                  aim: { muzzle: { x: -30, y: 0 }, pivot: { x: -8, y: 0 } } });
            expect(aim.current!.localPivot).toEqual({ x: -8, y: 0 });
            visual();
            owner.setConfiguration({ ...config, imageOffset: { x: 20, y: 30 } });
            expect(aim.current!.pivot).toEqual({ x: 121, y: 135 });
            target.takeDamage(100);
            expect(aim.current).toBeNull();
            expect(owner.presentation.orientation("sprite")).toEqual({ angle: 0.4, pivot: { x: 1, y: 2 } });
            release(); previous.release(); simulation.dispose();
      });

      it("releases on generator cancellation, interruption, and removal without stale release interference", () => {
            const { owner, target, simulation, aim } = fixture();
            const behavior = new BehaviorRuntime(owner, { now: () => simulation.nowMs,
                  entities: () => simulation.entities.all(), isCombatActive: () => simulation.isCombatActive });
            owner.setBehavior(behavior);
            const started = behavior.start({ id: "aim", cooldownMs: 0 }, target,
                  () => scoped(() => aim.track(target), function* () { yield wait(100); }));
            expect(started.started).toBe(true);
            expect(aim.current).not.toBeNull();
            behavior.cancel("interrupted");
            expect(aim.current).toBeNull();
            const oldRelease = aim.track(target)!;
            aim.track(target);
            oldRelease();
            expect(aim.current).not.toBeNull();
            owner.cancel("interrupted");
            expect(aim.current).toBeNull();
            aim.track(target);
            simulation.remove(owner.runtimeId);
            expect(owner.presentation.orientation("sprite")).toBeNull();
            expect(aim.current).toBeNull();
            simulation.dispose();
      });

      it.each(["left", "right"] as const)("keeps the %s-facing muzzle on its target under composed root transforms", facing => {
            const { owner, target, simulation, aim } = fixture();
            Body.setPosition(target.body, { x: facing === "left" ? 30 : 300, y: 190 });
            Body.setAngle(owner.body, 0.43);
            const physicsPosition = { ...owner.body.position };
            owner.presentation.acquireOffset({ x: 9, y: -13 });
            owner.presentation.acquireOffset({ x: -2, y: 4 });
            owner.presentation.acquireRotation(0.27);
            owner.presentation.acquireRotation(-0.12);
            owner.presentation.acquirePose("fire");
            aim.track(target);
            const solution = aim.current!;
            const view = entityView(owner);
            expect(view.angle).toBeCloseTo(0.58);
            expect(view.x).toBe(104);
            expect(view.y).toBe(95);
            const drawnMuzzle = transformPoint(viewChildTransform(view, "sprite"), { x: -24, y: 5 });
            expect(drawnMuzzle.x).toBeCloseTo(solution.origin.x);
            expect(drawnMuzzle.y).toBeCloseTo(solution.origin.y);
            const dx = target.body.position.x - solution.origin.x, dy = target.body.position.y - solution.origin.y;
            expect(dx * solution.direction.y - dy * solution.direction.x).toBeCloseTo(0, 8);
            expect(dx * solution.direction.x + dy * solution.direction.y).toBeGreaterThan(0);
            expect(owner.body.position).toEqual(physicsPosition);
            expect(owner.body.angle).toBe(0.43);
            simulation.dispose();
      });

      it.each(["left", "right"] as const)("keeps weapon aim in the %s-facing root hierarchy", facing => {
            const { owner, target, simulation } = fixture();
            owner.setConfiguration({ ...owner.config, weaponOffset: { x: 11, y: -7 }, weaponPivot: { x: 3, y: 4 } });
            const aim = owner.components.use("weaponAim", new SpriteAim({ entity: owner, simulation,
                  get config() { return owner.config; } }, { muzzle: { x: -22, y: 6 }, pivot: { x: -3, y: 2 } }, "weapon"));
            Body.setPosition(target.body, { x: facing === "left" ? 30 : 300, y: 190 });
            Body.setAngle(owner.body, -0.31);
            owner.presentation.acquireOffset({ x: -4, y: 12 });
            owner.presentation.acquireRotation(0.71);
            aim.track(target);
            const solution = aim.current!;
            const view = entityView(owner);
            const drawnMuzzle = transformPoint(viewChildTransform(view, "weapon"), { x: -22, y: 6 });
            expect(drawnMuzzle.x).toBeCloseTo(solution.origin.x);
            expect(drawnMuzzle.y).toBeCloseTo(solution.origin.y);
            const mirror = facing === "left" ? 1 : -1;
            const pivot = transformPoint(viewRootTransform(view), { x: mirror * (11 - 3), y: -7 + 2 });
            expect(solution.pivot.x).toBeCloseTo(pivot.x);
            expect(solution.pivot.y).toBeCloseTo(pivot.y);
            const dx = target.body.position.x - solution.origin.x, dy = target.body.position.y - solution.origin.y;
            expect(dx * solution.direction.y - dy * solution.direction.x).toBeCloseTo(0, 8);
            expect(dx * solution.direction.x + dy * solution.direction.y).toBeGreaterThan(0);
            simulation.dispose();
      });
});
