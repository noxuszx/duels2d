import { Body } from "matter-js";
import { describe, expect, it } from "vitest";
import defaults from "../config/fighters/defaults.json";
import data from "../config/fighters/angryman.json";
import { composeFighter } from "../src/config/fighter-config";
import { angryMan } from "../src/content/fighters/angryman/definition";
import { fighterBlueprints } from "../src/content/manifest";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Simulation } from "../src/engine/simulation";
import { entityView } from "../src/presentation/view";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const config = composeFighter(defaults as FighterDefaults, data as FighterDefinition);
function setup() {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 2000, minY: 0, maxY: 1200 },
            seed: 4, impact: { minSpeed: 100_000 }, globalSpeedMultiplier: .25 });
      const fighter = createFighter(simulation, config, { runtimeId: "angry", teamId: "A",
            position: { x: 300, y: 500 }, velocity: { x: 2.75, y: 1.65 } }, angryMan);
      const enemy = createFighter(simulation, config, { runtimeId: "enemy", teamId: "B",
            position: { x: 1100, y: 500 }, velocity: { x: 0, y: 0 } });
      Body.setStatic(enemy.body, true);
      return { simulation, fighter, enemy };
}
function advance(simulation: Simulation, ticks: number) {
      for (let index = 0; index < ticks; index++) simulation.step();
}

describe("Angry Man's scripted charge", () => {
      it("stops and shakes visually for windup, bounds the dash duration, recovers, and observes cooldown", () => {
            const { simulation, fighter } = setup();
            expect(fighterBlueprints.get("angryman")).toBe(angryMan);
            simulation.step();
            expect(fighter.presentation.pose).toBe("attackWindup");
            expect(fighter.body.velocity).toEqual({ x: 0, y: 0 });
            expect(fighter.resources.isHeld("locomotion")).toBe(true);
            expect(fighter.presentation.drainEvents()).toContainEqual({ type: "sound",
                  payload: expect.objectContaining({ cue: "attackWindup" }) });
            const position = { ...fighter.body.position };
            simulation.step();
            expect(fighter.body.position).toEqual(position);
            expect(entityView(fighter).x).not.toBe(fighter.body.position.x);
            expect(fighter.presentation.rotation).not.toBe(0);
            advance(simulation, 103);
            expect(fighter.presentation.pose).toBe("attackWindup");
            simulation.step();
            expect(fighter.presentation.pose).toBe("attackActive");
            expect(fighter.presentation.offset).toEqual({ x: 0, y: 0 });
            expect(fighter.presentation.rotation).toBe(0);
            expect(fighter.presentation.drainEvents()).toContainEqual({ type: "sound-stop",
                  payload: expect.objectContaining({ cue: "attackWindup" }) });
            advance(simulation, 22);
            expect(fighter.presentation.pose).toBe("idle");
            expect(fighter.resources.isHeld("locomotion")).toBe(false);
            advance(simulation, 18);
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(fighter.presentation.pose).toBeNull();
            advance(simulation, 574);
            expect(simulation.trace.filter(event => event.entityId === "angry" && event.kind === "admitted")).toHaveLength(1);
            advance(simulation, 1);
            expect(simulation.trace.filter(event => event.entityId === "angry" && event.kind === "admitted")).toHaveLength(2);
            simulation.dispose();
      });

      it("uses shared dash hits and knockback, ending early on collision", () => {
            const { simulation, fighter, enemy } = setup();
            simulation.step(); advance(simulation, 105);
            Body.setPosition(fighter.body, { x: enemy.body.position.x - 70, y: enemy.body.position.y });
            Body.setVelocity(fighter.body, { x: 2, y: 0 });
            simulation.step();
            expect(enemy.health).toBe(config.maxHealth - config.components.dash!.hit.damage!);
            expect(simulation.events).toContainEqual({ kind: "knockback", sourceId: "angry", targetId: "enemy", force: .1 });
            advance(simulation, 1);
            expect(fighter.resources.isHeld("locomotion")).toBe(false);
            expect(fighter.presentation.pose).toBe("idle");
            expect(simulation.events.filter(event => event.kind === "damage" && event.sourceId === "angry")).toHaveLength(1);
            simulation.dispose();
      });

      it("retargets after windup and stays idle without any live enemy", () => {
            const { simulation, fighter, enemy } = setup();
            simulation.step();
            const replacement = createFighter(simulation, config, { runtimeId: "replacement", teamId: "B",
                  position: { x: 100, y: 500 }, velocity: { x: 0, y: 0 } });
            Body.setStatic(replacement.body, true);
            simulation.remove(enemy.runtimeId);
            advance(simulation, 105);
            expect(fighter.presentation.pose).toBe("attackActive");
            expect(fighter.facing).toBe("left");
            simulation.reset();
            const lone = createFighter(simulation, config, { runtimeId: "lone", teamId: "A",
                  position: { x: 300, y: 500 }, velocity: { x: 2, y: 0 } }, angryMan);
            advance(simulation, 100);
            expect(lone.behavior?.isRunning).toBe(false);
            expect(lone.presentation.pose).toBeNull();
            simulation.dispose();
      });

      it("releases windup motion, movement, and sound on interruption and removal", () => {
            const { simulation, fighter } = setup();
            advance(simulation, 5);
            fighter.presentation.drainEvents();
            fighter.statuses.apply({ id: "stun", durationMs: 1000 });
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(fighter.resources.isHeld("locomotion")).toBe(false);
            expect(fighter.presentation.offset).toEqual({ x: 0, y: 0 });
            expect(fighter.presentation.rotation).toBe(0);
            expect(fighter.presentation.pose).toBeNull();
            expect(fighter.presentation.drainEvents()).toContainEqual({ type: "sound-stop",
                  payload: expect.objectContaining({ cue: "attackWindup" }) });
            advance(simulation, 720);
            expect(fighter.presentation.pose).toBe("attackWindup");
            simulation.remove(fighter.runtimeId);
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(fighter.resources.isHeld("locomotion")).toBe(false);
            expect(fighter.presentation.offset).toEqual({ x: 0, y: 0 });
            expect(fighter.presentation.rotation).toBe(0);
            simulation.dispose();
      });
});
