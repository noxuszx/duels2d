import { Bodies, Body, Composite } from "matter-js";
import { describe, expect, it } from "vitest";
import { Entity } from "../src/engine/entity";
import { Simulation } from "../src/engine/simulation";
import { OverlapTracker } from "../src/engine/spatial/overlap-tracker";
import type { EntityConfig } from "../src/types/entity";

const config: EntityConfig = { id: "shape", radius: 10, speed: 0, maxHealth: 100,
      hitbox: { type: "box", width: 20, height: 20 } };
function setup() {
      const simulation = new Simulation({ seed: 7,
            arena: { minX: 0, maxX: 500, minY: 0, maxY: 500 } });
      const add = (id: string, body: Body, teamId = "A", tags: string[] = []) => {
            const entity = new Entity({ runtimeId: id, configId: config.id, config, body, teamId, tags });
            simulation.add(entity);
            return entity;
      };
      return { simulation, add };
}

describe("spatial queries", () => {
      it("orders segment hits by first intersection, supports width, and leaves physics untouched", () => {
            const { simulation, add } = setup();
            const wide = add("wide", Bodies.rectangle(180, 100, 100, 20));
            const near = add("near", Bodies.rectangle(150, 100, 10, 20));
            const offset = add("offset", Bodies.rectangle(220, 120, 10, 10));
            const beyond = add("beyond", Bodies.rectangle(310, 100, 10, 10));
            const bodies = Composite.allBodies(simulation.engine.world);
            const from = { x: 0, y: 100 }, to = { x: 300, y: 100 };
            const thin = simulation.spatial.castSegment(from, to);
            expect(thin.map(hit => hit.entity)).toEqual([wide, near]);
            expect(thin.map(hit => hit.distance)).toEqual([130, 145]);
            expect(simulation.spatial.castSegment(from, to, { width: 40 }).map(hit => hit.entity))
                  .toEqual([wide, near, offset]);
            expect(simulation.spatial.castSegment(to, from).map(hit => hit.entity)).toEqual([wide, near]);
            expect(simulation.spatial.castSegment({ x: 140, y: 100 }, to)[0].distance).toBe(0);
            expect(Composite.allBodies(simulation.engine.world)).toEqual(bodies);
            expect(beyond.health).toBe(100);
            expect(simulation.events).toHaveLength(0);
            simulation.dispose();
      });

      it("uses rotated body parts rather than bounding boxes or compound parent hulls", () => {
            const { simulation, add } = setup();
            const diagonal = add("diagonal", Bodies.rectangle(100, 100, 100, 10, { angle: Math.PI / 4 }));
            const compound = add("compound", Body.create({ parts: [
                  Bodies.rectangle(220, 100, 20, 20), Bodies.rectangle(280, 100, 20, 20),
            ] }));
            expect(simulation.spatial.overlapArea({ type: "circle", center: { x: 135, y: 65 }, radius: 2 })).toEqual([]);
            expect(simulation.spatial.overlapArea({ type: "rectangle", center: { x: 135, y: 65 }, width: 3, height: 3 })).toEqual([]);
            expect(simulation.spatial.overlapArea({ type: "circle", center: { x: 100, y: 100 }, radius: 2 })).toEqual([diagonal]);
            expect(simulation.spatial.overlapArea({ type: "rectangle", center: { x: 100, y: 100 },
                  width: 4, height: 80, angle: Math.PI / 4 })).toEqual([diagonal]);
            expect(simulation.spatial.overlapArea({ type: "circle", center: { x: 250, y: 100 }, radius: 3 })).toEqual([]);
            expect(simulation.spatial.castSegment({ x: 250, y: 70 }, { x: 250, y: 130 })).toEqual([]);
            expect(simulation.spatial.overlapArea({ type: "rectangle", center: { x: 220, y: 100 }, width: 5, height: 5 })).toEqual([compound]);
            simulation.dispose();
      });

      it("filters live registered entities explicitly, without treating collision masks as visibility", () => {
            const { simulation, add } = setup();
            const owner = add("owner", Bodies.circle(100, 100, 10));
            const ally = add("ally", Bodies.circle(105, 100, 10));
            const enemy = add("enemy", Bodies.circle(110, 100, 10,
                  { isSensor: true, collisionFilter: { mask: 0 } }), "B", ["targetable"]);
            const dead = add("dead", Bodies.circle(115, 100, 10), "B", ["targetable"]);
            dead.takeDamage(100);
            const removed = add("removed", Bodies.circle(120, 100, 10));
            simulation.remove(removed.runtimeId);
            const area = { type: "circle" as const, center: { x: 100, y: 100 }, radius: 50 };
            expect(simulation.spatial.overlapArea(area)).toEqual([ally, enemy, owner]);
            expect(simulation.spatial.overlapArea(area, { includeDead: true })).toEqual([ally, dead, enemy, owner]);
            expect(simulation.spatial.overlapArea(area, { exclude: [owner],
                  filter: entity => entity.teamId !== owner.teamId && entity.tags.has("targetable") })).toEqual([enemy]);
            simulation.reset();
            expect(simulation.spatial.overlapArea(area)).toEqual([]);
            simulation.dispose();
      });

      it("tracks enter/stay/exit by entity identity, including removal and reused IDs", () => {
            const { simulation, add } = setup();
            const first = add("actor", Bodies.circle(100, 100, 10));
            const tracker = new OverlapTracker();
            const area = { type: "circle" as const, center: { x: 100, y: 100 }, radius: 20 };
            expect(tracker.update(simulation.spatial.overlapArea(area)))
                  .toEqual({ entered: [first], staying: [], exited: [] });
            expect(tracker.update([first, first])).toEqual({ entered: [], staying: [first], exited: [] });
            simulation.remove(first.runtimeId);
            const replacement = add("actor", Bodies.circle(100, 100, 10));
            expect(tracker.update(simulation.spatial.overlapArea(area)))
                  .toEqual({ entered: [replacement], staying: [], exited: [first] });
            Body.setPosition(replacement.body, { x: 300, y: 300 });
            expect(tracker.update(simulation.spatial.overlapArea(area)))
                  .toEqual({ entered: [], staying: [], exited: [replacement] });
            tracker.update([replacement]);
            tracker.clear();
            expect(tracker.update([])).toEqual({ entered: [], staying: [], exited: [] });
            simulation.dispose();
      });

      it("rejects invalid geometry and includes boundary contact", () => {
            const { simulation, add } = setup();
            const box = add("box", Bodies.rectangle(100, 100, 20, 20));
            expect(simulation.spatial.overlapArea({ type: "circle", center: { x: 80, y: 100 }, radius: 10 })).toEqual([box]);
            expect(simulation.spatial.castSegment({ x: 0, y: 90 }, { x: 90, y: 90 })[0].entity).toBe(box);
            expect(() => simulation.spatial.castSegment({ x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
            expect(() => simulation.spatial.castSegment({ x: NaN, y: 0 }, { x: 10, y: 0 })).toThrow(RangeError);
            expect(() => simulation.spatial.castSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { width: -1 })).toThrow(RangeError);
            expect(() => simulation.spatial.overlapArea({ type: "circle", center: { x: 0, y: 0 }, radius: 0 })).toThrow(RangeError);
            simulation.dispose();
      });
});
