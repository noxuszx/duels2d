import { Bodies, Body } from "matter-js";
import { describe, expect, it } from "vitest";
import type { ProjectileEmitterSettings } from "../src/config/component-settings";
import type { RuntimeConfig } from "../src/config/runtime-config";
import { Entity } from "../src/engine/entity";
import { Simulation } from "../src/engine/simulation";
import { SpriteAim } from "../src/gameplay/components/aim";
import { ProjectileEmitter } from "../src/gameplay/components/projectile";
import { CanvasRenderer } from "../src/presentation/canvas-renderer";
import { entityView } from "../src/presentation/view";
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
      const emitter = new ProjectileEmitter(context, settings, () => aim.current);
      return { config, owner, target, simulation, aim, emitter };
}

describe("owner-bound sprite aim", () => {
      it("stays inert until tracked and fires from the mirrored, moving pose's muzzle", () => {
            const { owner, target, simulation, aim, emitter } = fixture();
            expect(aim.current).toBeNull();
            expect(owner.presentation.rotation).toBeNull();
            expect(emitter.spawn(target)).toBeNull();
            const release = aim.track(target);
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
            const shot = emitter.spawn(target)!;
            expect(shot.body.position.x).toBeCloseTo(solution.origin.x);
            expect(shot.body.position.y).toBeCloseTo(solution.origin.y);
            expect(shot.body.velocity.x).toBeCloseTo(solution.direction.x * 10);
            expect(shot.body.velocity.y).toBeCloseTo(solution.direction.y * 10);
            expect(owner.body.force.x * solution.direction.x + owner.body.force.y * solution.direction.y).toBeLessThan(0);
            expect(owner.body.force.x * solution.direction.y - owner.body.force.y * solution.direction.x).toBeCloseTo(0);
            releasePose(); release();
            expect(aim.current).toBeNull();
            expect(owner.presentation.rotationPivot).toBeNull();
            simulation.dispose();
      });

      it("draws using the same mirrored pivot transform that determines the muzzle", () => {
            const { owner, target, simulation, aim } = fixture();
            aim.track(target);
            owner.presentation.acquirePose("fire");
            const solution = aim.current!;
            const calls: Array<[string, ...number[]]> = [];
            const ctx = { clearRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {},
                  beginPath() {}, arc() {}, fill() {}, rect() {}, moveTo() {}, lineTo() {}, closePath() {},
                  measureText: () => ({ width: 80 }),
                  translate: (x: number, y: number) => calls.push(["translate", x, y]),
                  rotate: (angle: number) => calls.push(["rotate", angle]),
                  scale: (x: number, y: number) => calls.push(["scale", x, y]),
            } as unknown as CanvasRenderingContext2D;
            const renderer = new CanvasRenderer(ctx, { game: { arena: { borderColor: "", borderWidth: 1 },
                  text: { footer: "" } } } as RuntimeConfig);
            renderer.render(500, 400, { ax: 0, ay: 0, aw: 500, ah: 400 },
                  [{ ...entityView(owner), showHealth: false }], 0);
            expect(calls).toEqual([["translate", solution.pivot.x, solution.pivot.y],
                  ["rotate", solution.angle], ["scale", -1, 1], ["translate", 6, -2]]);
            simulation.dispose();
      });

      it("uses visual overrides and live form data, invalidates dead targets, and restores leases", () => {
            const { owner, target, config, simulation, aim, emitter } = fixture();
            const previous = owner.presentation.acquireRotation(0.4, { x: 1, y: 2 });
            const release = aim.track(target);
            const visual = owner.presentation.acquireVisual({ image: "", imageOffset: { x: 1, y: 2 },
                  aim: { muzzle: { x: -30, y: 0 }, pivot: { x: -8, y: 0 } } });
            expect(aim.current!.localPivot).toEqual({ x: -8, y: 0 });
            visual();
            owner.setConfiguration({ ...config, imageOffset: { x: 20, y: 30 } });
            expect(aim.current!.pivot).toEqual({ x: 121, y: 135 });
            target.takeDamage(100);
            expect(aim.current).toBeNull();
            expect(emitter.spawn(target)).toBeNull();
            expect(owner.presentation.rotation).toBe(0.4);
            expect(owner.presentation.rotationPivot).toEqual({ x: 1, y: 2 });
            release(); previous(); simulation.dispose();
      });

      it("releases on generator cancellation, interruption, and removal without stale release interference", () => {
            const { owner, target, simulation, aim } = fixture();
            const script = aim.follow(target, function* () { yield { start: () => true, isComplete: false,
                  advance: () => 0, cancel() {} }; });
            script.next();
            expect(aim.current).not.toBeNull();
            script.return();
            expect(aim.current).toBeNull();
            const oldRelease = aim.track(target);
            aim.track(target);
            oldRelease();
            expect(aim.current).not.toBeNull();
            owner.cancel("interrupted");
            expect(aim.current).toBeNull();
            aim.track(target);
            simulation.remove(owner.runtimeId);
            expect(owner.presentation.rotation).toBeNull();
            expect(aim.current).toBeNull();
            simulation.dispose();
      });
});
