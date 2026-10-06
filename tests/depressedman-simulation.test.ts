import { Body } from "matter-js";
import { describe, expect, it } from "vitest";
import defaults from "../config/fighters/defaults.json";
import data from "../config/fighters/depressedman.json";
import { composeFighter } from "../src/config/fighter-config";
import { depressedMan } from "../src/content/fighters/depressedman/definition";
import { fighterBlueprints } from "../src/content/manifest";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Simulation } from "../src/engine/simulation";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const config = composeFighter(defaults as FighterDefaults, data as FighterDefinition);

function setup(enemyPos = { x: 800, y: 500 }) {
      const simulation = new Simulation({
            arena: { minX: 0, maxX: 2000, minY: 0, maxY: 1200 },
            seed: 42,
            impact: { minSpeed: 100_000 },
            globalSpeedMultiplier: 1,
      });
      const fighter = createFighter(
            simulation,
            config,
            {
                  runtimeId: "sad",
                  teamId: "A",
                  position: { x: 300, y: 500 },
                  velocity: { x: 0, y: 0 },
            },
            depressedMan,
      );
      const enemy = createFighter(
            simulation,
            config,
            {
                  runtimeId: "enemy",
                  teamId: "B",
                  position: enemyPos,
                  velocity: { x: 0, y: 0 },
            },
      );
      Body.setStatic(enemy.body, true);
      return { simulation, fighter, enemy };
}

function advance(simulation: Simulation, ticks: number) {
      for (let i = 0; i < ticks; i++) simulation.step();
}

describe("Depressed Man's exploding tear", () => {
      it("is registered in the blueprint manifest", () => {
            expect(fighterBlueprints.get("depressedman")).toBe(depressedMan);
      });

      it("spits a tear toward an enemy that explodes into 4 diagonal mini-tears on impact", () => {
            // Place enemy close so the tear hits quickly
            const { simulation, fighter, enemy } = setup({ x: 450, y: 500 });
            const initialEnemyHp = enemy.health;

            // Step 1: Admission and windup
            simulation.step();
            expect(fighter.presentation.pose).toBe("attackActive");

            // Advance through windup (33ms ~ 4 ticks)
            advance(simulation, 4);

            // Tear should be spawned in simulation
            const projectiles = simulation.entities.all().filter(e => e.ownerId === fighter.runtimeId);
            expect(projectiles.length).toBeGreaterThanOrEqual(1);
            const mainTear = projectiles[0];
            expect(mainTear.config.radius).toBe(30);

            // Advance until tear hits enemy
            let hitOccurred = false;
            for (let i = 0; i < 50; i++) {
                  simulation.step();
                  if (enemy.health < initialEnemyHp) {
                        hitOccurred = true;
                        break;
                  }
            }

            expect(hitOccurred).toBe(true);
            // Enemy took direct tear damage (25 damage)
            expect(enemy.health).toBe(initialEnemyHp - 25);

            // Main tear is consumed on hit
            expect(simulation.entities.get(mainTear.runtimeId)).toBeNull();

            // 4 mini-tears should be spawned at the explosion position
            const miniTears = simulation.entities.all().filter(
                  e => e.ownerId === fighter.runtimeId && e.config.radius === 15,
            );
            expect(miniTears).toHaveLength(4);

            // Verify diagonal velocities
            for (const mini of miniTears) {
                  const vx = mini.body.velocity.x;
                  const vy = mini.body.velocity.y;
                  expect(Math.abs(Math.abs(vx) - Math.abs(vy))).toBeLessThan(0.01);
            }
      });

      it("explodes into 4 diagonal mini-tears on wall impact", () => {
            // Place enemy far away past the right wall so tear travels directly into wall
            const { simulation, fighter } = setup({ x: 3000, y: 500 });

            // Depressed Man at x=1900 near the right wall (maxX=2000)
            Body.setPosition(fighter.body, { x: 1900, y: 500 });

            advance(simulation, 5);
            const projectiles = simulation.entities.all().filter(e => e.ownerId === fighter.runtimeId);
            expect(projectiles.length).toBe(1);
            const mainTear = projectiles[0];

            // Advance until main tear hits the right wall (maxX = 2000)
            let wallBurstOccurred = false;
            for (let i = 0; i < 60; i++) {
                  simulation.step();
                  const miniTears = simulation.entities.all().filter(
                        e => e.ownerId === fighter.runtimeId && e.config.radius === 15,
                  );
                  if (miniTears.length === 4) {
                        wallBurstOccurred = true;
                        break;
                  }
            }

            expect(wallBurstOccurred).toBe(true);
            expect(simulation.entities.get(mainTear.runtimeId)).toBeNull();
      });

      it("explodes into 4 diagonal mini-tears when its lifetime duration expires", () => {
            const { simulation, fighter } = setup({ x: 1000, y: 500 });

            advance(simulation, 5);
            const projectiles = simulation.entities.all().filter(e => e.ownerId === fighter.runtimeId);
            expect(projectiles.length).toBe(1);
            const mainTear = projectiles[0];

            // Manually expire the tear by advancing past its 2500ms duration (around 300 ticks)
            // But let's test directly that triggering "expired" removal spawns the 4 mini-tears:
            simulation.remove(mainTear.runtimeId, "expired");

            const miniTears = simulation.entities.all().filter(
                  e => e.ownerId === fighter.runtimeId && e.config.radius === 15,
            );
            expect(miniTears).toHaveLength(4);
      });
});
