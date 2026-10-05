import { Body } from "matter-js";
import { describe, expect, it } from "vitest";
import defaults from "../config/fighters/defaults.json";
import alienManData from "../config/fighters/alienman.json";
import alienData from "../config/fighters/alien.json";
import { composeFighter } from "../src/config/fighter-config";
import { alienMan } from "../src/content/fighters/alienman/definition";
import { alien } from "../src/content/fighters/alien/definition";
import { Simulation } from "../src/engine/simulation";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Forms } from "../src/gameplay/components/forms";
import { SpriteAim } from "../src/gameplay/components/aim";
import { entityView } from "../src/presentation/view";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const ownerConfig = composeFighter(defaults as FighterDefaults, alienManData as FighterDefinition);
const alienConfig = composeFighter(defaults as FighterDefaults, alienData as FighterDefinition);
function advance(simulation: Simulation, ticks: number) {
      for (let index = 0; index < ticks; index++) simulation.step();
}
function setup(speed = .001) {
      const config = structuredClone(ownerConfig);
      config.components.saucer!.speed = speed;
      const simulation = new Simulation({ arena: { minX: 0, maxX: 1200, minY: 0, maxY: 1000 },
            seed: 11, impact: { minSpeed: 10_000 }, globalSpeedMultiplier: .25 });
      const owner = createFighter(simulation, config, { runtimeId: "owner", teamId: "A",
            collisionGroup: -1, roster: [config, alienConfig],
            position: { x: 300, y: 500 }, velocity: { x: 0, y: 0 } }, alienMan);
      const enemy = createFighter(simulation, config, { runtimeId: "enemy", teamId: "B",
            position: { x: 900, y: 500 }, velocity: { x: 0, y: 0 } });
      Body.setStatic(owner.body, true); Body.setStatic(enemy.body, true);
      simulation.step();
      const saucer = simulation.entities.all().find(entity => entity.configId === "saucer")!;
      const summons = () => simulation.entities.all().filter(entity => entity.configId === "alien");
      return { simulation, owner, enemy, saucer, summons };
}

describe("Alien Man and owned actors", () => {
      it("sweeps between both edges while the beam visual follows the same world-space shape", () => {
            const { simulation, saucer } = setup(1000);
            let min = Infinity, max = -Infinity;
            for (let index = 0; index < 300; index++) {
                  simulation.step();
                  min = Math.min(min, saucer.body.position.x); max = Math.max(max, saucer.body.position.x);
                  const visual = entityView(saucer).shapes?.[0];
                  if (visual?.shape.type === "rectangle") {
                        expect(visual.shape.center.x).toBe(saucer.body.position.x);
                        expect(visual.shape.width).toBe(100);
                  }
            }
            expect(min).toBe(80); expect(max).toBe(1120);
            expect(saucer.body.isSensor).toBe(true);
            expect(saucer.tags.size).toBe(0);
            simulation.dispose();
      });

      it("pulses only during the two-second beam window and filters allies", () => {
            const { simulation, owner, enemy, saucer } = setup();
            Body.setPosition(enemy.body, { x: saucer.body.position.x, y: 500 });
            Body.setPosition(owner.body, { x: saucer.body.position.x, y: 750 });
            simulation.step();
            expect(enemy.health).toBe(990); expect(owner.health).toBe(1000);
            advance(simulation, 19); expect(enemy.health).toBe(990);
            // Rounded authored intervals can put the next pulse one tick after 1/6 second.
            advance(simulation, 2); expect(enemy.health).toBe(980);
            advance(simulation, 219); expect(enemy.health).toBe(880);
            expect(saucer.presentation.shapes).toHaveLength(0);
            advance(simulation, 119); expect(enemy.health).toBe(880);
            advance(simulation, 1); expect(enemy.health).toBe(870);
            simulation.dispose();
      });

      it("transforms for two seconds, stops the beam, deploys at +1/+4/+7 seconds, and removes dependents on death", () => {
            const { simulation, owner, saucer, summons } = setup();
            owner.takeDamage(500);
            simulation.step();
            const forms = owner.components.get<Forms>("forms")!;
            expect(owner.presentation.visual?.image).toContain("alienman-trans.png");
            advance(simulation, 239); expect(forms.is("transformed")).toBe(false);
            advance(simulation, 1); expect(forms.is("transformed")).toBe(true);
            expect(saucer.presentation.shapes).toHaveLength(0);
            advance(simulation, 119); expect(summons()).toHaveLength(0);
            advance(simulation, 1); expect(summons()).toHaveLength(1);
            expect(Math.hypot(summons()[0].body.velocity.x, summons()[0].body.velocity.y))
                  .toBeCloseTo(alienConfig.speed * simulation.globalSpeedMultiplier * Math.hypot(1, .6));
            advance(simulation, 360); expect(summons()).toHaveLength(2);
            advance(simulation, 360); expect(summons()).toHaveLength(3);
            const spawned = summons();
            expect(new Set(spawned.map(entity => entity.runtimeId)).size).toBe(3);
            for (const entity of spawned) {
                  expect(entity.maxHealth).toBe(100);
                  expect(entity.teamId).toBe(owner.teamId);
                  expect(entity.ownerId).toBe(owner.runtimeId);
                  expect(entity.body.collisionFilter.group).toBe(-1);
            }
            advance(simulation, 480); expect(summons()).toHaveLength(3);
            owner.takeDamage(500); simulation.step();
            expect(summons()).toHaveLength(0);
            expect(saucer.isRemoved).toBe(true);
            expect(saucer.presentation.shapes).toHaveLength(0);
            for (const entity of spawned) expect(entity.presentation.weaponRotation).toBeNull();
            simulation.dispose();
      });

      it("fires piercing instant lasers from the independently tracked weapon without repeated flash damage", () => {
            const simulation = new Simulation({ arena: { minX: 0, maxX: 1200, minY: 0, maxY: 1000 },
                  seed: 11, impact: { minSpeed: 10_000 } });
            const config = structuredClone(alienConfig);
            config.defaultFacing = "right";
            config.weaponOffset = { x: 0, y: 0 };
            config.components.weaponAim = { muzzle: { x: 32, y: 0 }, pivot: { x: 0, y: 0 } };
            const shooter = createFighter(simulation, config, { runtimeId: "alien", teamId: "A",
                  position: { x: 200, y: 300 }, velocity: { x: 0, y: 0 } }, alien);
            const targets = ["A", "B", "B"].map((teamId, index) => createFighter(simulation, ownerConfig,
                  { runtimeId: `target:${index}`, teamId,
                        position: { x: 400 + index * 200, y: 300 }, velocity: { x: 0, y: 0 } }));
            for (const entity of [shooter, ...targets]) Body.setStatic(entity.body, true);
            simulation.step();
            expect(targets.map(entity => entity.health)).toEqual([1000, 970, 970]);
            expect(shooter.presentation.rotation).toBeNull();
            expect(shooter.presentation.weaponRotation).not.toBeNull();
            expect(shooter.presentation.shapes).toHaveLength(1);
            advance(simulation, 8);
            expect(shooter.presentation.shapes).toHaveLength(0);
            expect(targets.map(entity => entity.health)).toEqual([1000, 970, 970]);
            advance(simulation, 232);
            expect(targets.map(entity => entity.health)).toEqual([1000, 940, 940]);
            Body.setPosition(targets[1].body, { x: 100, y: 500 });
            const solution = shooter.components.get<SpriteAim>("aim")!.current!;
            const dx = targets[1].body.position.x - solution.origin.x;
            const dy = targets[1].body.position.y - solution.origin.y;
            expect(dx * solution.direction.y - dy * solution.direction.x).toBeCloseTo(0);
            expect(shooter.facing).toBe("left");
            simulation.reset();
            expect(shooter.presentation.weaponRotation).toBeNull();
            expect(shooter.presentation.shapes).toHaveLength(0);
            expect(simulation.entities.size).toBe(0);
            simulation.dispose();
      });
});
