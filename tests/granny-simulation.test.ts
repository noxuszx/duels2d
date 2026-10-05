import { describe, expect, it } from "vitest";
import { Body } from "matter-js";
import defaults from "../config/fighters/defaults.json";
import definition from "../config/fighters/granny.json";
import { composeFighter } from "../src/config/fighter-config";
import { granny } from "../src/content/fighters/granny/definition";
import { fighterBlueprints } from "../src/content/manifest";
import { createFighter } from "../src/gameplay/fighter-factory";
import { Forms } from "../src/gameplay/components/forms";
import { SpriteAim } from "../src/gameplay/components/aim";
import { entityView } from "../src/presentation/view";
import { Simulation } from "../src/engine/simulation";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";

const config = composeFighter(defaults as FighterDefaults, definition as FighterDefinition);
function setup(enemyPosition = { x: 440, y: 300 }) {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 1200, minY: 0, maxY: 1000 },
            seed: 11, impact: { minSpeed: 10_000 } });
      const fighter = createFighter(simulation, config, { runtimeId: "granny", teamId: "A",
            position: { x: 300, y: 300 }, velocity: { x: 0, y: 0 } }, granny);
      const enemy = createFighter(simulation, config, { runtimeId: "enemy", teamId: "B",
            position: enemyPosition, velocity: { x: 0, y: 0 } });
      // Isolate action timing and hit geometry from ordinary cruise movement.
      Body.setStatic(fighter.body, true);
      Body.setStatic(enemy.body, true);
      const forms = fighter.components.get<Forms>("forms")!;
      const aim = fighter.components.get<SpriteAim>("aim")!;
      return { simulation, fighter, enemy, forms, aim };
}
function advance(simulation: Simulation, ticks: number) {
      for (let tick = 0; tick < ticks; tick++) simulation.step();
}

describe("Granny in the simulation", () => {
      it("is registered and swings after windup, once per enemy with the configured cooldown", () => {
            expect(fighterBlueprints.get("granny")).toBe(granny);
            const { simulation, fighter, enemy } = setup();
            simulation.step();
            expect(fighter.presentation.pose).toBe("attackWindup");
            advance(simulation, 29);
            expect(enemy.health).toBe(1000);
            advance(simulation, 1);
            expect(enemy.health).toBe(955);
            expect(fighter.presentation.pose).toBe("attackActive");
            advance(simulation, 48);
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(enemy.health).toBe(955);
            advance(simulation, 52);
            expect(enemy.health).toBe(955);
            advance(simulation, 32);
            expect(enemy.health).toBe(910);
            simulation.dispose();
      });

      it("interrupts a swing at exactly 40%, shows both sprites, then commits the form without healing", () => {
            const { simulation, fighter, enemy, forms } = setup();
            simulation.step();
            fighter.takeDamage(600);
            simulation.step();
            expect(fighter.behavior?.currentMove?.id).toBe("transformation");
            expect(entityView(fighter).pose.image).toContain("granny-pre-trans.png");
            expect(forms.is("transformed")).toBe(false);
            advance(simulation, 119);
            expect(entityView(fighter).pose.image).toContain("granny-pre-trans.png");
            advance(simulation, 1);
            expect(entityView(fighter).pose.image).toContain("granny-trans.png");
            advance(simulation, 119);
            expect(forms.is("transformed")).toBe(false);
            advance(simulation, 1);
            expect(forms.is("transformed")).toBe(true);
            expect(fighter.health).toBe(400);
            expect(enemy.health).toBe(1000);
            expect(fighter.config.moves["rolling-pin-strike"]).toBeUndefined();
            expect(fighter.config.moves["shotgun-blast"]).toBeDefined();
            expect(config.moves["rolling-pin-strike"]).toBeDefined();
            expect(fighter.presentation.visual).toBeNull();
            expect(entityView(fighter).pose.image).toContain("granny-shotgun.png");
            simulation.dispose();
      });

      it("fires from the aimed muzzle, damages for 90 and recoils opposite the shot", () => {
            const { simulation, fighter, enemy, forms, aim } = setup({ x: 750, y: 550 });
            forms.enter("transformed");
            simulation.step();
            advance(simulation, 23);
            expect(simulation.entities.all().filter(entity => entity.ownerId === fighter.runtimeId)).toHaveLength(0);
            const solution = aim.current!;
            expect(solution).not.toBeNull();
            advance(simulation, 1);
            const projectile = simulation.entities.all().find(entity => entity.ownerId === fighter.runtimeId)!;
            expect(projectile).toBeDefined();
            expect(projectile.body.position.x).toBeCloseTo(solution.origin.x);
            expect(projectile.body.position.y).toBeCloseTo(solution.origin.y);
            expect(projectile.body.velocity.x).toBeCloseTo(solution.direction.x * 12);
            expect(projectile.body.velocity.y).toBeCloseTo(solution.direction.y * 12);
            expect(simulation.events).toContainEqual({ kind: "knockback", sourceId: "granny", targetId: "granny", force: .12 });
            advance(simulation, 85);
            expect(enemy.health).toBe(910);
            expect(aim.current).toBeNull();
            expect(fighter.presentation.rotation).toBeNull();
            const shots = simulation.trace.filter(event => event.entityId === "granny" &&
                  event.kind === "admitted" && event.moveId === "shotgun-blast");
            expect(shots).toHaveLength(1);
            advance(simulation, 60);
            expect(simulation.trace.filter(event => event.entityId === "granny" &&
                  event.kind === "admitted" && event.moveId === "shotgun-blast")).toHaveLength(2);
            simulation.dispose();
      });

      it("does not transform above the threshold or spend attack cooldown with no enemy in range", () => {
            const { simulation, fighter, forms } = setup({ x: 850, y: 800 });
            fighter.takeDamage(599);
            advance(simulation, 300);
            expect(forms.is("transformed")).toBe(false);
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(simulation.trace.filter(event => event.entityId === "granny" && event.kind === "admitted")).toHaveLength(0);
            simulation.dispose();
      });

      it("keeps forms and component state independent for two Grannies sharing one config", () => {
            const { simulation, fighter, forms } = setup({ x: 850, y: 800 });
            const second = createFighter(simulation, config, { runtimeId: "second-granny", teamId: "A",
                  position: { x: 500, y: 500 }, velocity: { x: 0, y: 0 } }, granny);
            Body.setStatic(second.body, true);
            fighter.takeDamage(600);
            advance(simulation, 241);
            expect(forms.is("transformed")).toBe(true);
            expect(second.components.get<Forms>("forms")!.is("transformed")).toBe(false);
            expect(second.config.components.melee).toBeDefined();
            expect(second.config.components.projectile).toBeUndefined();
            expect(second.components.get("aim")).not.toBe(fighter.components.get("aim"));
            simulation.dispose();
      });

      it("releases interrupted transformation sprites and restarts the sequence when stun expires", () => {
            const { simulation, fighter, forms } = setup({ x: 850, y: 800 });
            fighter.takeDamage(650);
            advance(simulation, 60);
            fighter.statuses.apply({ id: "stun", durationMs: 100 });
            expect(fighter.presentation.visual).toBeNull();
            expect(forms.is("transformed")).toBe(false);
            advance(simulation, 11);
            expect(fighter.behavior?.isRunning).toBe(false);
            advance(simulation, 1);
            expect(entityView(fighter).pose.image).toContain("granny-pre-trans.png");
            advance(simulation, 240);
            expect(forms.is("transformed")).toBe(true);
            simulation.dispose();
      });

      it.each(["death", "remove", "reset"] as const)("cleans aimed actions on %s", stop => {
            const { simulation, fighter, enemy, forms, aim } = setup({ x: 750, y: 550 });
            forms.enter("transformed");
            simulation.step();
            expect(aim.current).not.toBeNull();
            if (stop === "death") fighter.takeDamage(1000);
            else if (stop === "remove") simulation.remove(fighter.runtimeId);
            else simulation.reset();
            expect(fighter.behavior?.isRunning).toBe(false);
            expect(aim.current).toBeNull();
            expect(fighter.presentation.rotation).toBeNull();
            expect(fighter.presentation.pose).toBeNull();
            simulation.dispose();
      });

      it("rejects a shot if its target disappears during windup", () => {
            const { simulation, fighter, enemy, forms, aim } = setup({ x: 750, y: 550 });
            forms.enter("transformed");
            simulation.step();
            // Keep a second enemy so target removal does not end the match.
            createFighter(simulation, config, { runtimeId: "replacement", teamId: "B",
                  position: { x: 1100, y: 800 }, velocity: { x: 0, y: 0 } });
            simulation.remove(enemy.runtimeId);
            advance(simulation, 24);
            expect(simulation.entities.all().filter(entity => entity.ownerId === fighter.runtimeId)).toHaveLength(0);
            expect(aim.current).toBeNull();
            expect(simulation.events.filter(event => event.kind === "knockback" && event.sourceId === "granny")).toHaveLength(0);
            simulation.dispose();
      });
});
