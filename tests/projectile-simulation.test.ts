import { describe, expect, it } from "vitest";
import { Bodies, Body, Composite } from "matter-js";
import type { ProjectileEmitterSettings } from "../src/config/component-settings";
import { Entity } from "../src/engine/entity";
import { BehaviorRuntime } from "../src/engine/behavior-runtime";
import { Simulation } from "../src/engine/simulation";
import { ProjectileEmitter } from "../src/gameplay/components/projectile";
import { entityView } from "../src/presentation/view";
import type { FighterConfig } from "../src/types/fighter";

const config = {
      id: "fixture", maxHealth: 100, speed: 4, radius: 10,
      hitbox: { type: "circle", radius: 10 }, hitboxOffset: { x: 0, y: 0 },
      defaultFacing: "right", image: null, imageScale: 1,
} as FighterConfig;

function fighter(id: string, teamId: string, x: number, y = 100): Entity {
      return new Entity({ runtimeId: id, configId: id, teamId,
            body: Bodies.circle(x, y, 10, { friction: 0, frictionAir: 0 }), config });
}

function settings(overrides: Partial<ProjectileEmitterSettings["projectile"]["flight"]> = {}): ProjectileEmitterSettings {
      return { projectile: {
            radius: 5, speed: 10, damage: 20, image: ["one.png", "two.png"],
            flight: {
                  collision: { response: "sensor", enemyContact: "consume", ownerContact: "ignore", walls: "ignore" },
                  lifetime: { type: "duration", durationMs: 500 },
                  ownership: { onOwnerDeath: "persist", onOwnerRemoval: "persist", onMatchEnd: "remove" },
                  ...overrides,
            },
      } };
}

function fixture(shot = settings(), impactMinSpeed = 1_000) {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 400, minY: 0, maxY: 200 },
            seed: 17, impact: { minSpeed: impactMinSpeed, damage: 45 } });
      const owner = fighter("owner", "A", 100);
      const enemy = fighter("enemy", "B", 250);
      const ally = fighter("ally", "A", 50, 150);
      simulation.add(owner);
      simulation.add(ally);
      simulation.add(enemy);
      const emitter = owner.components.use("projectile", new ProjectileEmitter({ entity: owner, simulation, config }, shot));
      return { simulation, owner, ally, enemy, emitter };
}

describe("projectile flight in the headless simulation", () => {
      it("registers a noncontestant body, deals one attributed hit, and consumes on enemy contact", () => {
            const shot = settings();
            shot.hitSound = "contact";
            const { simulation, owner, enemy, emitter } = fixture(shot);
            const projectile = emitter.spawn(enemy);
            expect(projectile).not.toBeNull();
            expect(projectile!.ownerId).toBe(owner.runtimeId);
            expect(projectile!.tags.size).toBe(0);
            expect(simulation.entities.get(projectile!.runtimeId)).toBe(projectile);
            expect(Composite.allBodies(simulation.engine.world)).toContain(projectile!.body);
            expect(entityView(projectile!).pose.image).toBe(projectile!.config.image);
            for (let i = 0; i < 50 && !projectile!.isRemoved; i++) simulation.step();
            expect(enemy.health).toBe(80);
            expect(projectile!.removalReason).toBe("hit");
            expect(simulation.events).toContainEqual({ kind: "damage", sourceId: owner.runtimeId,
                  targetId: enemy.runtimeId, amount: 20, killed: false });
            expect(Composite.allBodies(simulation.engine.world)).not.toContain(projectile!.body);
            expect(owner.presentation.drainEvents()).toContainEqual({ type: "sound", payload: { cue: "contact" } });
            expect(simulation.rules.outcome).toBeNull();
            simulation.dispose();
      });

      it("expires on simulation time and follows explicit owner removal policy", () => {
            const { simulation, owner, enemy, emitter } = fixture(settings({
                  lifetime: { type: "duration", durationMs: 25 },
            }));
            const projectile = emitter.spawn(enemy)!;
            expect(simulation.remove(owner.runtimeId)).toBe(true);
            expect(projectile.isRemoved).toBe(false);
            simulation.step();
            simulation.step();
            expect(projectile.isRemoved).toBe(false);
            simulation.step();
            expect(projectile.removalReason).toBe("expired");
            simulation.dispose();

            const second = fixture(settings({ ownership: {
                  onOwnerDeath: "remove", onOwnerRemoval: "remove", onMatchEnd: "remove",
            } }));
            const child = second.emitter.spawn(second.enemy)!;
            second.simulation.remove(second.owner.runtimeId);
            expect(child.removalReason).toBe("owner-removed");
            second.simulation.dispose();
      });

      it("catches its owner and preserves a persisted projectile after owner death", () => {
            const caught = fixture(settings({ collision: {
                  response: "sensor", enemyContact: "pierce", ownerContact: "catch", walls: "ignore",
            } }));
            const child = caught.emitter.spawn(caught.enemy)!;
            Body.setPosition(caught.owner.body, child.body.position);
            caught.simulation.step();
            expect(child.removalReason).toBe("hit");
            caught.simulation.dispose();

            const surviving = fixture(settings({ lifetime: { type: "persistent" } }));
            const flying = surviving.emitter.spawn(surviving.enemy)!;
            surviving.owner.takeDamage(100);
            surviving.simulation.step();
            expect(flying.isRemoved).toBe(false);
            surviving.ally.takeDamage(100);
            surviving.simulation.step();
            expect(surviving.simulation.rules.outcome).toEqual({ kind: "winner", teamId: "B" });
            expect(flying.isRemoved).toBe(false);
            surviving.simulation.dispose();
      });

      it("pierces each enemy once and lets an ignored wall leave the arena", () => {
            const shot = settings({
                  collision: { response: "sensor", enemyContact: "pierce", ownerContact: "ignore", walls: "ignore" },
                  lifetime: { type: "persistent" },
            });
            const { simulation, enemy, emitter } = fixture(shot);
            const projectile = emitter.spawn(enemy)!;
            for (let i = 0; i < 100; i++) simulation.step();
            expect(projectile.isRemoved).toBe(false);
            expect(projectile.body.position.x).toBeGreaterThan(simulation.arena.maxX);
            expect(enemy.health).toBe(80);
            expect(simulation.events.filter(event => event.kind === "damage" && event.targetId === enemy.runtimeId))
                  .toHaveLength(1);
            simulation.dispose();
      });

      it("uses a physical body and the shared wall bounce policy when requested", () => {
            const shot = settings({
                  collision: { response: "physical", enemyContact: "pierce", ownerContact: "ignore", walls: "bounce" },
                  lifetime: { type: "persistent" },
            });
            const { simulation, enemy, emitter } = fixture(shot);
            const projectile = emitter.spawn(enemy)!;
            expect(projectile.body.isSensor).toBe(false);
            expect(projectile.resources.contactPolicy.defaultBounce).toBe(true);
            Body.setPosition(projectile.body, { x: simulation.arena.maxX - 2, y: 100 });
            Body.setVelocity(projectile.body, { x: 10, y: 0 });
            simulation.step();
            expect(projectile.body.velocity.x).toBeLessThan(0);
            simulation.dispose();
      });

      it("expires at exactly 500 ms of simulation time and rejects malformed direct settings", () => {
            const shot = settings({
                  collision: { response: "sensor", enemyContact: "pierce", ownerContact: "ignore", walls: "ignore" },
            });
            const { simulation, enemy, emitter } = fixture(shot);
            const projectile = emitter.spawn(enemy)!;
            for (let i = 0; i < 59; i++) simulation.step();
            expect(projectile.isRemoved).toBe(false);
            simulation.step();
            expect(projectile.removalReason).toBe("expired");
            simulation.dispose();

            const malformed = settings({ lifetime: { type: "duration", durationMs: 0 } });
            malformed.projectile.image = [];
            const invalid = fixture(malformed);
            expect(invalid.emitter.spawn(invalid.enemy)).toBeNull();
            expect(invalid.simulation.entities.size).toBe(3);
            invalid.simulation.dispose();
      });

      it("starts an inert fire operation only after behavior admission and commits its cooldown", () => {
            const { simulation, owner, enemy, emitter } = fixture();
            owner.setBehavior(new BehaviorRuntime(owner, {
                  now: () => simulation.nowMs,
                  entities: () => simulation.entities.all(),
                  isCombatActive: () => simulation.isCombatActive,
            }));
            const operation = emitter.start(enemy);
            expect(simulation.entities.size).toBe(3);
            const move = { id: "fire", cooldownMs: 500 };
            const first = owner.behavior!.start(move, enemy, function* () { yield operation; });
            expect(first.started).toBe(true);
            expect(simulation.entities.size).toBe(4);
            const second = owner.behavior!.start(move, enemy, function* () { yield emitter.start(enemy); });
            expect(second).toEqual({ started: false, reason: "cooldown" });
            expect(simulation.entities.size).toBe(4);
            simulation.dispose();
      });

      it("allocates distinct identities across two emitters on one owner", () => {
            const { simulation, owner, enemy, emitter } = fixture();
            const second = owner.components.use("second-projectile", new ProjectileEmitter(
                  { entity: owner, simulation, config }, settings()));
            const firstShot = emitter.spawn(enemy)!;
            const secondShot = second.spawn(enemy)!;
            expect(firstShot.runtimeId).not.toBe(secondShot.runtimeId);
            expect(simulation.entities.get(firstShot.runtimeId)).toBe(firstShot);
            expect(simulation.entities.get(secondShot.runtimeId)).toBe(secondShot);
            simulation.dispose();
      });

      it("does not apply ambient impact damage from a sensor projectile", () => {
            const { simulation, owner, enemy, emitter } = fixture(settings(), 1);
            const projectile = emitter.spawn(enemy)!;
            for (let i = 0; i < 50 && !projectile.isRemoved; i++) simulation.step();
            expect(enemy.health).toBe(80);
            expect(owner.health).toBe(100);
            expect(simulation.events.filter(event => event.kind === "damage" && event.targetId === enemy.runtimeId))
                  .toHaveLength(1);
            simulation.dispose();
      });

      it("lets a physical shot ignore its owner while retaining enemy physical contact", () => {
            const shot = settings({
                  collision: { response: "physical", enemyContact: "pierce", ownerContact: "ignore", walls: "ignore" },
                  lifetime: { type: "persistent" },
            });
            const { simulation, owner, enemy, emitter } = fixture(shot);
            const projectile = emitter.spawn(enemy)!;
            Body.setPosition(projectile.body, { x: 120, y: 100 });
            Body.setVelocity(projectile.body, { x: -10, y: 0 });
            for (let i = 0; i < 8; i++) simulation.step();
            expect(projectile.body.position.x).toBeLessThan(owner.body.position.x - 10);
            expect(projectile.body.velocity.x).toBeLessThan(0);
            expect(owner.body.velocity.x).toBeCloseTo(0);
            expect(projectile.isRemoved).toBe(false);
            Body.setPosition(projectile.body, { x: 220, y: 100 });
            Body.setVelocity(projectile.body, { x: 10, y: 0 });
            for (let i = 0; i < 12 && enemy.health === 100; i++) simulation.step();
            expect(enemy.health).toBe(80);
            expect(projectile.body.isSensor).toBe(false);
            simulation.dispose();
      });
});
