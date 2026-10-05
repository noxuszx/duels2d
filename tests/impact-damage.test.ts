import { describe, expect, it } from "vitest";
import { Bodies, Body } from "matter-js";
import defaults from "../config/fighters/defaults.json";
import baby from "../config/fighters/babyman.json";
import { Entity } from "../src/engine/entity";
import { Simulation } from "../src/engine/simulation";
import { MatchRules } from "../src/gameplay/match-rules";
import { composeFighter } from "../src/config/fighter-config";
import { assertFighterDefinition } from "../src/config/validation";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";
import type { StudioConfig } from "../tools/character-studio/app/editor-types";
import { getSaveContent } from "../tools/character-studio/persistence/fighter-serializer";

const babyConfig = composeFighter(defaults as FighterDefaults, baby as FighterDefinition);
function fighter(id: string, x: number, multiplier?: number) {
      return new Entity({ runtimeId: id, configId: id, teamId: id,
            body: Bodies.rectangle(x, 100, 20, 20, { friction: 0, frictionAir: 0 }),
            config: { id, radius: 10, hitbox: { type: "box", width: 20, height: 20 },
                  speed: 4, maxHealth: 1000, impactDamageMultiplier: multiplier } });
}
function simulation() {
      return new Simulation({ arena: { minX: 0, maxX: 400, minY: 0, maxY: 300 },
            seed: 42, impact: { minSpeed: 1, damage: 10 } });
}

describe("impact resistance", () => {
      it("composes Babyman's immunity and preserves it through Studio save/reload", () => {
            expect(babyConfig.impactDamageMultiplier).toBe(0);
            const saved = JSON.parse(getSaveContent([baby as FighterDefinition],
                  babyConfig as StudioConfig, defaults as FighterDefaults)) as FighterDefinition;
            assertFighterDefinition(saved);
            expect(saved.combat?.impactDamageMultiplier).toBe(0);
            expect(composeFighter(defaults as FighterDefaults, saved).impactDamageMultiplier).toBe(0);
            const ordinary = composeFighter(defaults as FighterDefaults,
                  { id: "ordinary", name: "Ordinary", color: "#ffffff" });
            expect(ordinary.impactDamageMultiplier).toBe(1);
      });

      it("validates nonnegative multipliers and keeps zero valid", () => {
            expect(() => assertFighterDefinition({ ...baby,
                  combat: { impactDamageMultiplier: -1 } })).toThrow();
            expect(() => assertFighterDefinition({ ...baby,
                  combat: { impactDamageMultiplier: "0" } })).toThrow();
            expect(() => assertFighterDefinition(baby)).not.toThrow();
      });

      it("scales collision damage, preserves thresholds, and defaults generic entities to normal damage", () => {
            const rules = new MatchRules({ minSpeed: 1, damage: 10 });
            const ordinary = fighter("ordinary", 100);
            const resistant = fighter("resistant", 100, 0.5);
            const immune = fighter("immune", 100, 0);
            expect(rules.impactDamage(ordinary, 3, 4)).toBe(20);
            expect(rules.impactDamage(resistant, 3, 4)).toBe(10);
            expect(rules.impactDamage(immune, 3, 4)).toBe(0);
            expect(rules.impactDamage(resistant, 1, 4)).toBe(0);
      });

      it("bounces immune fighters off walls without damage while ordinary fighters take damage", () => {
            for (const multiplier of [babyConfig.impactDamageMultiplier, 1]) {
                  const sim = simulation();
                  const target = fighter("target", 4, multiplier);
                  sim.add(target);
                  sim.add(fighter("opponent", 300));
                  Body.setVelocity(target.body, { x: -4, y: 0 });
                  sim.step();
                  expect(target.body.velocity.x).toBeGreaterThan(0);
                  if (multiplier === 0) {
                        expect(target.health).toBe(1000);
                        expect(sim.events.some(event => event.kind === "damage")).toBe(false);
                  } else expect(target.health).toBeLessThan(1000);
                  sim.dispose();
            }
      });

      it("blocks fighter impact damage while preserving attack damage and knockback", () => {
            const sim = simulation();
            const target = fighter("target", 100, babyConfig.impactDamageMultiplier);
            const attacker = fighter("attacker", 115);
            sim.add(target);
            sim.add(attacker);
            Body.setVelocity(attacker.body, { x: -4, y: 0 });
            sim.step();
            expect(target.health).toBe(1000);
            expect(attacker.health).toBeLessThan(1000);
            const health = target.health;
            const result = sim.hit(attacker, target, { damage: 25, knockback: 0.01 },
                  { independentCooldown: true });
            expect(result.actualDamage).toBe(25);
            expect(result.knockbackApplied).toBe(true);
            expect(target.health).toBe(health - 25);
            sim.dispose();
      });

      it("continues respecting temporary contact protection", () => {
            const sim = simulation();
            const target = fighter("target", 4);
            target.resources.acquireContactPolicy({ allowImpactDamage: false });
            sim.add(target);
            sim.add(fighter("opponent", 300));
            Body.setVelocity(target.body, { x: -4, y: 0 });
            sim.step();
            expect(target.health).toBe(1000);
            expect(target.body.velocity.x).toBeGreaterThan(0);
            sim.dispose();
      });
});
