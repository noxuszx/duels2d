import { describe, expect, it } from "vitest";
import { Body, Composite } from "matter-js";
import defaultsJson from "../config/fighters/defaults.json";
import babyJson from "../config/fighters/babyman.json";
import grannyJson from "../config/fighters/granny.json";
import { composeFighter } from "../src/config/fighter-config";
import { assertFighterDefaults } from "../src/config/validation";
import { defineFighter, createFighter } from "../src/gameplay/fighter-factory";
import type { BehaviorContact } from "../src/gameplay/fighter-factory";
import type { EntityComponent } from "../src/engine/component";
import type { ArenaWall } from "../src/engine/contracts";
import { wait } from "../src/engine/scripting";
import { Simulation } from "../src/engine/simulation";
import type { FighterConfig, FighterDefaults, FighterDefinition } from "../src/types/fighter";

const defaults = defaultsJson as FighterDefaults;
const babyConfig = composeFighter(defaults, babyJson as FighterDefinition);
const arena = { minX: 0, maxX: 500, minY: 0, maxY: 500 };

function simulation() {
      return new Simulation({ arena, seed: 17, impact: { minSpeed: 1_000 } });
}

function spawn(sim: Simulation, config: FighterConfig, runtimeId: string, x: number,
      blueprint?: ReturnType<typeof defineFighter>) {
      return createFighter(sim, config, {
            runtimeId, teamId: "A", position: { x, y: 250 }, velocity: { x: 0, y: 0 },
      }, blueprint);
}

class Pulse implements EntityComponent {
      spawnCalls = 0;
      updateCalls = 0;
      attach(): void {}
      spawn() { this.spawnCalls++; return wait(25); }
      update() { this.updateCalls++; return wait(25); }
}

class ContactRecorder implements EntityComponent {
      readonly contacts: string[] = [];
      attach(): void {}
}

describe("fighter authoring boundaries", () => {
      it("runs spawn once and schedules independent idle updates for two instances of one component class", () => {
            const sim = simulation();
            const config = { ...babyConfig, components: {}, moves: {
                  born: { cooldownMs: 0 }, idle: { cooldownMs: 100 },
            } };
            const blueprint = defineFighter({
                  id: "pulse", components: { pulse: () => new Pulse() },
                  tasks: { onSpawn: "born", onUpdate: "idle" },
                  behavior: ({ pulse }: { pulse: Pulse }) => ({
                        *onSpawn() { yield pulse.spawn(); },
                        *onUpdate() { yield pulse.update(); },
                  }),
            });
            const first = spawn(sim, config, "first", 100, blueprint);
            const second = spawn(sim, config, "second", 350, blueprint);
            const firstPulse = first.components.get<Pulse>("pulse")!;
            const secondPulse = second.components.get<Pulse>("pulse")!;
            expect(firstPulse).not.toBe(secondPulse);
            for (let tick = 0; tick < 6; tick++) sim.step();
            expect(firstPulse.spawnCalls).toBe(1);
            expect(secondPulse.spawnCalls).toBe(1);
            expect(firstPulse.updateCalls).toBe(1);
            expect(secondPulse.updateCalls).toBe(1);
            first.statuses.apply({ id: "stun", durationMs: 1_000 });
            for (let tick = 0; tick < 30; tick++) sim.step();
            expect(firstPulse.updateCalls).toBe(1);
            expect(secondPulse.updateCalls).toBeGreaterThan(1);
            expect(sim.trace.filter(event => event.entityId === "first" && event.moveId === "born" &&
                  event.kind === "admitted")).toHaveLength(1);
            expect(sim.trace.filter(event => event.entityId === "second" && event.moveId === "born" &&
                  event.kind === "admitted")).toHaveLength(1);
            sim.dispose();
      });

      it.each(["onSpawn", "onUpdate", "onContact", "onWallContact"] as const)(
            "rejects a %s hook without its configured move before registering a body", hook => {
                  const sim = simulation();
                  const blueprint = defineFighter({
                        id: "incomplete", components: {}, tasks: {},
                        behavior: () => ({ [hook]: function* () { yield wait(10); } }),
                  });
                  expect(() => spawn(sim, { ...babyConfig, components: {}, moves: {} },
                        "invalid", 100, blueprint)).toThrow(/requires a configured move/);
                  expect(sim.entities.all()).toHaveLength(0);
                  expect(Composite.allBodies(sim.engine.world)).toHaveLength(0);
                  sim.dispose();
            },
      );

      it("routes wall and enemy contacts to their configured hook moves", () => {
            const sim = simulation();
            const config = { ...babyConfig, components: {}, moves: {
                  wall: { cooldownMs: 0 }, contact: { cooldownMs: 0 },
            } };
            const blueprint = defineFighter({
                  id: "contact-probe", components: { recorder: () => new ContactRecorder() },
                  tasks: { onWallContact: "wall", onContact: "contact" },
                  behavior: ({ recorder }: { recorder: ContactRecorder }) => ({
                        *onWallContact({ wall }: { wall: ArenaWall }) {
                              recorder.contacts.push(`wall:${wall}`);
                              yield wait(20);
                        },
                        *onContact(event: BehaviorContact) {
                              recorder.contacts.push(`contact:${event.kind}`);
                              yield wait(20);
                        },
                  }),
            });
            const baby = createFighter(sim, config, {
                  runtimeId: "baby", teamId: "A", position: { x: 20, y: 250 },
                  velocity: { x: -12, y: 0 },
            }, blueprint);
            const enemy = createFighter(sim, config, {
                  runtimeId: "enemy", teamId: "B", position: { x: 350, y: 250 },
                  velocity: { x: 0, y: 0 },
            });
            const recorder = baby.components.get<ContactRecorder>("recorder")!;
            sim.step();
            expect(recorder.contacts).toEqual(["wall:left"]);
            for (let tick = 0; tick < 3; tick++) sim.step();
            Body.setPosition(baby.body, { x: 200, y: 250 });
            Body.setPosition(enemy.body, { x: 215, y: 250 });
            sim.step();
            expect(recorder.contacts).toContain("contact:entity");
            expect(sim.trace).toContainEqual({ kind: "admitted", entityId: "baby",
                  moveId: "contact", reason: undefined });
            sim.dispose();
      });

      it("rejects malformed component settings before registering a Matter body", () => {
            const sim = simulation();
            const config = structuredClone(babyConfig);
            config.components.wallCrawl!.durationMs = -1;
            expect(() => spawn(sim, config, "invalid", 100)).toThrow();
            expect(sim.entities.all()).toHaveLength(0);
            expect(Composite.allBodies(sim.engine.world)).toHaveLength(0);
            sim.dispose();
      });

      it("uses supplied form component and move maps as replacements, while omissions inherit the base", () => {
            const granny = composeFighter(defaults, grannyJson as FighterDefinition);
            expect(granny.components.melee).toBeDefined();
            expect(granny.moves["rolling-pin-strike"]).toBeDefined();
            expect(granny.forms.transformed.components.projectile).toBeDefined();
            expect(granny.forms.transformed.components.melee).toBeUndefined();
            expect(granny.forms.transformed.moves["shotgun-blast"]).toBeDefined();
            expect(granny.forms.transformed.moves["rolling-pin-strike"]).toBeUndefined();

            const definition = structuredClone(babyJson) as FighterDefinition;
            definition.forms = { inherited: {}, empty: { components: {}, moves: {} } };
            const composed = composeFighter(defaults, definition);
            expect(composed.forms.inherited.components).toEqual(composed.components);
            expect(composed.forms.inherited.moves).toEqual(composed.moves);
            expect(composed.forms.inherited.components).not.toBe(composed.components);
            expect(composed.forms.empty.components).toEqual({});
            expect(composed.forms.empty.moves).toEqual({});
      });

      it("requires a complete defaults foundation", () => {
            expect(() => assertFighterDefaults(defaultsJson)).not.toThrow();
            const incomplete = structuredClone(defaultsJson);
            delete (incomplete.combat as Partial<typeof incomplete.combat>).maxHealth;
            expect(() => assertFighterDefaults(incomplete)).toThrow(/maxHealth/);
            expect(() => assertFighterDefaults({ components: {}, moves: {} })).toThrow();
      });
});
