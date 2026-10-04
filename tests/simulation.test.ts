import { describe, expect, it } from "vitest";
import { Bodies, Body, Composite } from "matter-js";
import { Entity } from "../src/engine/entity";
import { Simulation, SIMULATION_STEP_MS } from "../src/engine/simulation";
import type { FighterConfig } from "../src/types/fighter";

const config = {
      id: "fixture", maxHealth: 100, speed: 4, radius: 10,
      hitbox: { type: "box", width: 20, height: 20 },
      defaultFacing: "right",
} as FighterConfig;

function fighter(id: string, teamId: string, x: number, y = 100, health = 100): Entity {
      return new Entity({ runtimeId: id, configId: id, teamId,
            body: Bodies.rectangle(x, y, 20, 20, { friction: 0, frictionAir: 0, restitution: 0.82 }),
            config, health });
}

function simulation(seed = 42): Simulation {
      return new Simulation({ arena: { minX: 0, maxX: 400, minY: 0, maxY: 300 },
            seed, impact: { minSpeed: 1_000, damage: 45 } });
}

describe("headless simulation", () => {
      it("advances a fixed 120 Hz clock and reproducible gameplay random source", () => {
            const first = simulation();
            const second = simulation();
            expect(first.rng.next()).toBe(second.rng.next());
            first.step();
            first.step();
            expect(first.tick).toBe(2);
            expect(first.nowMs).toBeCloseTo(SIMULATION_STEP_MS * 2);
            first.dispose();
            second.dispose();
      });

      it("merges pre-contact and newly acquired wall policies before default bounce", () => {
            const sim = simulation();
            const baby = fighter("baby", "A", 4);
            const enemy = fighter("enemy", "B", 300);
            sim.add(baby);
            sim.add(enemy);
            Body.setVelocity(baby.body, { x: -4, y: 0 });
            baby.components.use("crawl-on-wall", {
                  contact(event) {
                        if (event.kind !== "wall") return;
                        baby.resources.acquireContactPolicy({ defaultBounce: false, allowImpactDamage: false });
                        Body.setVelocity(baby.body, { x: 0, y: 2 });
                  },
            });
            sim.step();
            expect(baby.body.velocity.x).toBe(0);
            expect(baby.body.velocity.y).toBe(2);
            expect(baby.health).toBe(100);
            sim.dispose();
      });

      it("keeps the captured dash policy when the contact handler releases it", () => {
            const sim = simulation();
            const baby = fighter("baby", "A", 4);
            sim.add(baby);
            sim.add(fighter("enemy", "B", 300));
            const release = baby.resources.acquireContactPolicy({
                  defaultBounce: false, allowImpactDamage: false,
            });
            Body.setVelocity(baby.body, { x: -4, y: 0 });
            baby.components.use("end-dash", {
                  contact(event) { if (event.kind === "wall") release(); },
            });
            sim.step();
            expect(baby.body.velocity.x).toBeLessThan(0);
            expect(baby.resources.contactPolicy.defaultBounce).toBe(true);
            sim.dispose();
      });

      it("makes contact removal visible immediately and removes the Matter body after dispatch", () => {
            const sim = simulation();
            const first = fighter("first", "A", 100);
            const second = fighter("second", "B", 115);
            let bodyStillInWorldDuringContact = false;
            first.components.use("remove-on-contact", {
                  contact(event) {
                        if (event.kind !== "entity") return;
                        expect(event.normal.x).toBeLessThan(0);
                        sim.remove(second.runtimeId);
                        bodyStillInWorldDuringContact = Composite.allBodies(sim.engine.world).includes(second.body);
                        expect(sim.entities.get(second.runtimeId)).toBeNull();
                  },
            });
            sim.add(first);
            sim.add(second);
            sim.step();
            expect(bodyStillInWorldDuringContact).toBe(true);
            expect(Composite.allBodies(sim.engine.world)).not.toContain(second.body);
            sim.dispose();
      });

      it("retires an owned body when its owner is removed", () => {
            const sim = simulation();
            const owner = fighter("owner", "A", 100);
            const child = new Entity({ runtimeId: "child", configId: "fixture", teamId: "A",
                  ownerId: owner.runtimeId, tags: [], config,
                  body: Bodies.circle(130, 100, 5) });
            sim.add(owner);
            sim.add(child);
            sim.add(fighter("enemy", "B", 300));
            expect(sim.remove(owner.runtimeId)).toBe(true);
            expect(owner.isRemoved).toBe(true);
            expect(child.removalReason).toBe("owner-removed");
            expect(sim.entities.get(child.runtimeId)).toBeNull();
            expect(Composite.allBodies(sim.engine.world)).not.toContain(child.body);
            sim.dispose();
      });

      it("removes an expired body before physics can push a surviving entity", () => {
            const sim = simulation();
            const expiring = fighter("expiring", "A", 100);
            const survivor = fighter("survivor", "B", 115);
            expiring.components.use("expire", { beforeStep: () => { sim.remove(expiring.runtimeId, "expired"); } });
            sim.add(expiring);
            sim.add(survivor);
            sim.step();
            expect(survivor.body.position.x).toBe(115);
            expect(survivor.body.velocity.x).toBe(0);
            expect(Composite.allBodies(sim.engine.world)).not.toContain(expiring.body);
            sim.dispose();
      });

      it("reflects both axes at a corner without restoring an outward velocity", () => {
            const sim = simulation();
            const box = fighter("corner", "A", 4, 4);
            sim.add(box);
            sim.add(fighter("enemy", "B", 300));
            Body.setVelocity(box.body, { x: -4, y: -4 });
            sim.step();
            expect(box.body.velocity.x).toBeGreaterThan(0);
            expect(box.body.velocity.y).toBeGreaterThan(0);
            sim.dispose();
      });

      it("resolves lethal contact attacks in stable runtime-ID order", () => {
            const sim = simulation();
            const alpha = fighter("alpha", "A", 100);
            const zeta = fighter("zeta", "B", 115);
            alpha.components.use("contact-attack", {
                  contact(event) { if (event.kind === "entity") sim.hit(alpha, event.other, { damage: 100 }); },
            });
            zeta.components.use("contact-attack", {
                  contact(event) { if (event.kind === "entity") sim.hit(zeta, event.other, { damage: 100 }); },
            });
            // Add in reverse order to prove Matter body iteration cannot choose the winner.
            sim.add(zeta);
            sim.add(alpha);
            sim.step();
            expect(alpha.isDead).toBe(false);
            expect(zeta.isDead).toBe(true);
            expect(sim.rules.outcome).toEqual({ kind: "winner", teamId: "A" });
            sim.dispose();
      });

      it("routes periodic status damage through shared combat and ends on the surviving team", () => {
            const sim = simulation();
            const first = fighter("first", "A", 100);
            const second = fighter("second", "B", 300, 100, 2);
            sim.add(first);
            sim.add(second);
            expect(second.statuses.apply({ id: "burn", durationMs: 500, sourceId: first.runtimeId }).applied).toBe(true);
            for (let i = 0; i < 60; i++) sim.step();
            expect(second.isDead).toBe(true);
            expect(sim.state).toBe("ended");
            expect(sim.rules.outcome).toEqual({ kind: "winner", teamId: "A" });
            expect(sim.events).toContainEqual({ kind: "damage", sourceId: "first",
                  targetId: "second", amount: 2, killed: true });
            sim.dispose();
      });
});
