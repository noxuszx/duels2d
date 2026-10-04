import { describe, expect, it } from "vitest";
import { Body } from "matter-js";
import defaultsJson from "../config/fighters/defaults.json";
import babyJson from "../config/fighters/babyman.json";
import { composeFighter } from "../src/config/fighter-config";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Simulation } from "../src/engine/simulation";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const config = composeFighter(defaultsJson as FighterDefaults, babyJson as FighterDefinition);
function setup() {
      const sim = new Simulation({ arena: { minX: 0, maxX: 2000, minY: 0, maxY: 2000 },
            seed: 17, impact: { minSpeed: 1000 } });
      const spawn = (id: string, x: number) => createFighter(sim, config, {
            runtimeId: id, teamId: id, position: { x, y: 1000 }, velocity: { x: 0, y: 0 },
      });
      return { sim, source: spawn("source", 500), target: spawn("target", 1000) };
}

describe("knockback rotation", () => {
      it("suppresses ordinary collision spin, including off-center contacts", () => {
            const { sim, source, target } = setup();
            let contacts = 0;
            target.components.use("contact-observer", { contact() { contacts++; } });
            Body.setPosition(source.body, { x: 980, y: 1010 });
            Body.setVelocity(source.body, { x: 8, y: 0 });
            for (let i = 0; i < 10; i++) {
                  sim.step();
                  expect(target.body.angle).toBe(0);
                  expect(target.body.angularVelocity).toBe(0);
                  expect(target.resources.isHeld("upright")).toBe(false);
            }
            expect(contacts).toBeGreaterThan(0);
            sim.dispose();
      });

      it("allows rotation after knockback, refreshes its window, then straightens smoothly", () => {
            const { sim, source, target } = setup();
            expect(sim.combat.knockback(source, target, 0.001)).toBe(true);
            expect(target.resources.isHeld("upright")).toBe(true);
            Body.setAngularVelocity(target.body, 0.05);
            sim.step();
            expect(target.body.angle).not.toBe(0);
            for (let i = 0; i < 60; i++) sim.step();
            sim.combat.knockback(source, target, 0.001);
            for (let i = 0; i < 60; i++) sim.step();
            expect(target.resources.isHeld("upright")).toBe(true);
            for (let i = 0; i < 31; i++) sim.step();
            expect(target.resources.isHeld("upright")).toBe(false);
            expect(target.body.angularVelocity).toBe(0);
            const angle = Math.abs(target.body.angle);
            for (let i = 0; i < 60; i++) sim.step();
            expect(Math.abs(target.body.angle)).toBeLessThan(angle);
            sim.dispose();
      });

      it("ignores recoil and invalid knockback, and respects another upright owner", () => {
            const { sim, source, target } = setup();
            sim.combat.knockback(target, target, 0.001, { x: 1, y: 0 });
            sim.combat.knockback(source, target, 0);
            expect(target.resources.isHeld("upright")).toBe(false);
            const release = target.resources.acquireExclusive("upright")!;
            sim.combat.knockback(source, target, 0.001);
            for (let i = 0; i < 100; i++) sim.step();
            expect(target.resources.isHeld("upright")).toBe(true);
            release();
            sim.combat.knockback(source, target, 0.001);
            target.cancel("interrupted");
            expect(target.resources.isHeld("upright")).toBe(false);
            sim.dispose();
      });
});
