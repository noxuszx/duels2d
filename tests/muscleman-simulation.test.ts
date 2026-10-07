import { Body } from "matter-js";
import { describe, expect, it } from "vitest";
import defaults from "../config/fighters/defaults.json";
import data from "../config/fighters/muscleman.json";
import { composeFighter } from "../src/config/fighter-config";
import { muscleMan } from "../src/content/fighters/muscleman/definition";
import { fighterBlueprints } from "../src/content/manifest";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Simulation } from "../src/engine/simulation";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";
import { onProjectileEvents } from "../src/content/script-helpers";

const config = composeFighter(defaults as FighterDefaults, data as FighterDefinition);
function setup(width = 4000) {
      const simulation = new Simulation({ arena: { minX: 0, maxX: width, minY: 0, maxY: 2000 },
            seed: 2, impact: { minSpeed: 100_000 } });
      const owner = createFighter(simulation, config, { runtimeId: "muscle", teamId: "A",
            position: { x: 300, y: 1000 }, velocity: { x: 0, y: 0 } }, muscleMan);
      const enemy = createFighter(simulation, { ...config, maxHealth: 5000 }, { runtimeId: "enemy", teamId: "B",
            position: { x: width - 300, y: 1000 }, velocity: { x: 0, y: 0 } });
      Body.setStatic(owner.body, true); Body.setStatic(enemy.body, true);
      const dumbbells = () => simulation.entities.all().filter(entity => entity.ownerId === owner.runtimeId);
      return { simulation, owner, enemy, dumbbells };
}
function advance(sim: Simulation, ticks: number) { for (let i = 0; i < ticks; i++) sim.step(); }

describe("Muscle Man", () => {
      it("is active in the manifest with the agreed thresholds", () => {
            expect(fighterBlueprints.get("muscleman")).toBe(muscleMan);
            expect(config.components.damageRamp!.maxDamage).toBe(300);
            expect(config.components.damageRamp!.hurtThrowThreshold).toBe(30);
      });

      it.each([[1, 30], [2, 90], [3, 180]])("charges %i seconds then throws %i damage when hurt", (seconds, damage) => {
            const { simulation, owner, enemy, dumbbells } = setup();
            advance(simulation, seconds * 120 + 1);
            expect(dumbbells()).toHaveLength(0);
            owner.takeDamage(1);
            simulation.step();
            const projectile = dumbbells()[0];
            expect(projectile).toBeDefined();
            const health = enemy.health;
            projectile.contact({ kind: "entity", self: projectile, other: enemy, normal: { x: -1, y: 0 },
                  incomingSpeed: 12, hadForegroundTask: false, policy: { allowImpactDamage: false, defaultBounce: true } });
            expect(enemy.health).toBe(health - damage);
            expect(projectile.isRemoved).toBe(false);
            simulation.dispose();
      });

      it("ignores hurt below 30 without banking a future throw", () => {
            const { simulation, owner, dumbbells } = setup();
            advance(simulation, 60);
            owner.takeDamage(1);
            advance(simulation, 62);
            expect(dumbbells()).toHaveLength(0);
            owner.takeDamage(1);
            simulation.step();
            expect(dumbbells()).toHaveLength(1);
            simulation.dispose();
      });

      it("automatically throws at 300 and does not charge or throw again while unarmed", () => {
            const { simulation, owner, enemy, dumbbells } = setup(20_000);
            advance(simulation, 520);
            expect(dumbbells()).toHaveLength(0);
            simulation.step();
            const projectile = dumbbells()[0];
            expect(projectile).toBeDefined();
            const health = enemy.health;
            projectile.contact({ kind: "entity", self: projectile, other: enemy, normal: { x: -1, y: 0 },
                  incomingSpeed: 12, hadForegroundTask: false, policy: { allowImpactDamage: false, defaultBounce: true } });
            expect(enemy.health).toBe(health - 300);
            owner.takeDamage(1);
            advance(simulation, 550);
            expect(dumbbells()).toEqual([projectile]);
            expect(owner.presentation.pose).toBe("attackActive");
            // Catch it explicitly; the next charge must restart at the one-increase rate.
            projectile.contact({ kind: "entity", self: projectile, other: owner, normal: { x: 1, y: 0 },
                  incomingSpeed: 12, hadForegroundTask: false, policy: { allowImpactDamage: false, defaultBounce: true } });
            advance(simulation, 61);
            owner.takeDamage(1); simulation.step();
            expect(dumbbells()).toHaveLength(0);
            advance(simulation, 60);
            owner.takeDamage(1); simulation.step();
            const next = dumbbells()[0];
            const nextTargetHealth = enemy.health;
            next.contact({ kind: "entity", self: next, other: enemy, normal: { x: -1, y: 0 },
                  incomingSpeed: 12, hadForegroundTask: false, policy: { allowImpactDamage: false, defaultBounce: true } });
            expect(enemy.health).toBe(nextTargetHealth - 30);
            simulation.dispose();
      });

      it("redirects at a wall, tracks a moving owner, catches, and resumes charging", () => {
            const { simulation, owner, dumbbells } = setup(1200);
            advance(simulation, 121);
            owner.takeDamage(1); simulation.step();
            const projectile = dumbbells()[0];
            let hitWall = false;
            onProjectileEvents(projectile, { onWall() { hitWall = true; } });
            for (let tick = 0; tick < 300 && !hitWall; tick++) simulation.step();
            expect(hitWall).toBe(true);
            expect(projectile.body.velocity.x).toBeLessThan(0);
            Body.setPosition(owner.body, { x: 300, y: 600 });
            advance(simulation, 2);
            expect(projectile.body.velocity.y).toBeLessThan(0);
            for (let tick = 0; tick < 300 && !projectile.isRemoved; tick++) simulation.step();
            expect(projectile.removalReason).toBe("hit");
            expect(projectile.resources.isHeld("locomotion")).toBe(false);
            expect(dumbbells()).toHaveLength(0);
            advance(simulation, 121);
            owner.takeDamage(1); simulation.step();
            expect(dumbbells()).toHaveLength(1);
            simulation.dispose();
      });

      it.each(["direct", "combat"])("uses %s damage events even after healing and presentation-buffer draining", source => {
            const { simulation, owner, dumbbells } = setup();
            advance(simulation, 121);
            if (source === "combat") simulation.combat.damage(owner, 1, { independentCooldown: true });
            else owner.takeDamage(1);
            owner.heal(1);
            simulation.events.splice(0);
            simulation.step();
            expect(dumbbells()).toHaveLength(1);
            simulation.dispose();
      });

      it.each(["death", "removal", "reset"])("retires its dumbbell and resources on %s", action => {
            const { simulation, owner, dumbbells } = setup();
            advance(simulation, 121);
            owner.takeDamage(1); simulation.step();
            const projectile = dumbbells()[0];
            if (action === "death") { owner.takeDamage(owner.health); simulation.step(); }
            if (action === "removal") simulation.remove(owner.runtimeId);
            if (action === "reset") simulation.reset();
            expect(projectile.isRemoved).toBe(true);
            expect(projectile.behavior!.isRunning).toBe(false);
            expect(projectile.presentation.rotation).toBe(0);
            expect(owner.presentation.pose).toBeNull();
            simulation.dispose();
      });
});
