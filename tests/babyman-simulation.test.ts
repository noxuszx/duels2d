import { describe, expect, it } from "vitest";
import { Body, Composite } from "matter-js";
import defaults from "../config/fighters/defaults.json";
import definition from "../config/fighters/babyman.json";
import { composeFighter } from "../src/config/fighter-config";
import { babyMan } from "../src/content/fighters/babyman/definition";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Simulation, SIMULATION_STEP_MS } from "../src/engine/simulation";
import type { Entity } from "../src/engine/entity";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const config = composeFighter(defaults as FighterDefaults, definition as FighterDefinition);
const crawlTicks = Math.round(config.components.wallCrawl!.durationMs / SIMULATION_STEP_MS);
const arena = { minX: 0, maxX: 400, minY: 0, maxY: 300 };

function setup(position = { x: 20, y: 150 }, velocity = { x: -12, y: 0 },
      enemyPosition = { x: 200, y: 150 }, impactMinSpeed = 1) {
      const simulation = new Simulation({ arena, seed: 7,
            impact: { minSpeed: impactMinSpeed, damage: 45 }, collisionCooldownMs: 100 });
      const baby = createFighter(simulation, config, {
            runtimeId: "baby", teamId: "A", position, velocity,
      }, babyMan);
      const enemy = createFighter(simulation, config, {
            runtimeId: "enemy", teamId: "B", position: enemyPosition, velocity: { x: 0, y: 0 },
      });
      return { simulation, baby, enemy };
}

function advance(simulation: Simulation, ticks: number): void {
      for (let tick = 0; tick < ticks; tick++) simulation.step();
}

function expectReleased(baby: Entity): void {
      expect(baby.behavior?.isRunning).toBe(false);
      expect(baby.resources.isHeld("locomotion")).toBe(false);
      expect(baby.resources.isHeld("upright")).toBe(false);
      expect(baby.resources.contactPolicy).toEqual({ defaultBounce: true, allowImpactDamage: true });
      expect(baby.presentation.pose).toBeNull();
      expect(baby.presentation.orientation("sprite")).toBeNull();
}

describe("Baby Man in a headless match", () => {
      it.each([
            ["left", { x: 20, y: 150 }, { x: -12, y: 0 }, "y", 1],
            ["right", { x: 380, y: 150 }, { x: 12, y: 0 }, "y", 1],
            ["top", { x: 200, y: 20 }, { x: 0, y: -12 }, "x", 1],
            ["bottom", { x: 200, y: 330 }, { x: 0, y: 12 }, "x", 1],
      ] as const)("starts a %s-wall crawl without bouncing or impact damage", (_wall, position, velocity, axis, sign) => {
            const { simulation, baby } = setup(position, velocity);
            simulation.step();
            expect(baby.behavior?.isRunning).toBe(true);
            expect(baby.resources.isHeld("locomotion")).toBe(true);
            expect(baby.resources.contactPolicy).toEqual({ defaultBounce: false, allowImpactDamage: false });
            expect(baby.health).toBe(config.maxHealth);
            expect(Math.sign(baby.body.velocity[axis])).toBe(sign);
            expect(baby.presentation.pose).toMatch(/^crawl[12]$/);
            simulation.dispose();
      });

      it("crawls for the configured duration, then dashes toward a live enemy", () => {
            const { simulation, baby, enemy } = setup(undefined, undefined, undefined, 1_000);
            simulation.step();
            advance(simulation, crawlTicks - 1);
            expect(baby.presentation.pose).toMatch(/^crawl[12]$/);
            expect(baby.resources.contactPolicy.defaultBounce).toBe(false);
            advance(simulation, 1);
            expect(baby.presentation.pose).toBe(config.components.dash!.pose);
            expect(baby.presentation.orientation("sprite")).toBeNull();
            expect(baby.resources.contactPolicy.defaultBounce).toBe(true);
            expect(baby.resources.contactPolicy.allowImpactDamage).toBe(false);
            const distance = Math.hypot(enemy.body.position.x - baby.body.position.x,
                  enemy.body.position.y - baby.body.position.y);
            advance(simulation, 10);
            expect(Math.hypot(enemy.body.position.x - baby.body.position.x,
                  enemy.body.position.y - baby.body.position.y)).toBeLessThan(distance);
            simulation.dispose();
      });

      it("deals configured dash damage once on collision and respects the move cooldown", () => {
            const { simulation, baby, enemy } = setup(undefined, undefined, undefined, 1_000);
            simulation.step();
            advance(simulation, crawlTicks);
            expect(baby.presentation.pose).toBe(config.components.dash!.pose);
            Body.setPosition(baby.body, { x: 120, y: 150 });
            Body.setVelocity(baby.body, { x: 0, y: 0 });
            Body.setPosition(enemy.body, { x: 170, y: 150 });
            advance(simulation, 2);
            expect(enemy.health).toBe(config.maxHealth - config.components.dash!.hit.damage);
            expect(simulation.events.filter(event => event.kind === "damage" && event.sourceId === baby.runtimeId &&
                  event.targetId === enemy.runtimeId)).toHaveLength(1);
            advance(simulation, 15);
            expect(enemy.health).toBe(config.maxHealth - config.components.dash!.hit.damage);
            expectReleased(baby);
            Body.setPosition(baby.body, { x: 20, y: 150 });
            Body.setVelocity(baby.body, { x: -12, y: 0 });
            simulation.step();
            expect(baby.behavior?.isRunning).toBe(false);
            expect(simulation.trace).toContainEqual({ kind: "rejected", entityId: "baby",
                  moveId: "wall-crawl-charge", reason: "cooldown" });
            simulation.dispose();
      });

      it("releases a crawl when interrupted or killed and never resumes it", () => {
            for (const stop of ["stun", "death"] as const) {
                  const { simulation, baby } = setup();
                  simulation.step();
                  if (stop === "stun") baby.statuses.apply({ id: "stun", durationMs: 5_000 });
                  else baby.takeDamage(baby.health);
                  expectReleased(baby);
                  advance(simulation, crawlTicks + 2);
                  expect(simulation.trace.filter(event => event.entityId === "baby" &&
                        event.kind === "operation-started")).toHaveLength(1);
                  simulation.dispose();
            }
      });

      it("cleans active movement on reset and owner removal", () => {
            for (const stop of ["reset", "remove"] as const) {
                  const { simulation, baby } = setup();
                  simulation.step();
                  if (stop === "reset") simulation.reset();
                  else simulation.remove(baby.runtimeId);
                  expectReleased(baby);
                  expect(Composite.allBodies(simulation.engine.world)).not.toContain(baby.body);
                  advance(simulation, crawlTicks + 2);
                  expect(baby.presentation.pose).toBeNull();
                  simulation.dispose();
            }
      });

      it("does not hold a task or spend cooldown when there is no live enemy", () => {
            const simulation = new Simulation({ arena, seed: 7, impact: { minSpeed: 1, damage: 45 } });
            const baby = createFighter(simulation, config, {
                  runtimeId: "baby", teamId: "A", position: { x: 20, y: 150 },
                  velocity: { x: -12, y: 0 },
            }, babyMan);
            simulation.step();
            expectReleased(baby);
            expect(simulation.trace).toContainEqual({ kind: "rejected", entityId: "baby",
                  moveId: "wall-crawl-charge", reason: "noop" });
            createFighter(simulation, config, {
                  runtimeId: "replacement", teamId: "B", position: { x: 200, y: 150 },
                  velocity: { x: 0, y: 0 },
            });
            Body.setPosition(baby.body, { x: 20, y: 150 });
            Body.setVelocity(baby.body, { x: -12, y: 0 });
            simulation.step();
            expect(baby.behavior?.isRunning).toBe(true);
            expect(baby.presentation.pose).toMatch(/^crawl[12]$/);
            simulation.dispose();
      });

      it("replays the same body motion and task history with the same seed", () => {
            function run() {
                  const { simulation, baby, enemy } = setup(undefined, undefined, undefined, 1_000);
                  const snapshots = [];
                  for (let tick = 1; tick <= 300; tick++) {
                        simulation.step();
                        if (tick % 25 === 0) snapshots.push({
                              tick,
                              baby: { position: { ...baby.body.position }, velocity: { ...baby.body.velocity } },
                              enemy: { position: { ...enemy.body.position }, velocity: { ...enemy.body.velocity } },
                        });
                  }
                  const result = { snapshots, trace: [...simulation.trace], events: [...simulation.events] };
                  simulation.dispose();
                  return result;
            }
            const first = run();
            const second = run();
            expect(first).toEqual(second);
            expect(first.trace.filter(event => event.entityId === "baby" &&
                  event.kind === "operation-started")).toHaveLength(2);
            expect(first.snapshots[0].baby.position).not.toEqual(first.snapshots.at(-1)!.baby.position);
      });
});
