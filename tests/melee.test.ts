import { describe, expect, it } from "vitest";
import { Bodies, Body } from "matter-js";
import { Entity } from "../src/engine/entity";
import { ScriptScope } from "../src/engine/scripting";
import { Simulation } from "../src/engine/simulation";
import { MeleeAttack } from "../src/gameplay/components";
import type { FighterConfig } from "../src/types/fighter";

const config = {
      id: "fixture", maxHealth: 100, speed: 4, radius: 10,
      hitbox: { type: "circle", radius: 10 }, hitboxOffset: { x: 5, y: -10 },
      defaultFacing: "right", image: null, imageScale: 1,
} as FighterConfig;

function fixture() {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 400, minY: 0, maxY: 300 }, seed: 7 });
      const fighter = (id: string, teamId: string, x: number, y: number) => {
            const entity = new Entity({ runtimeId: id, configId: id, teamId, config,
                  body: Bodies.circle(x, y, 10) });
            simulation.add(entity);
            return entity;
      };
      const owner = fighter("owner", "A", 105, 90);
      const enemy = fighter("enemy", "B", 150, 100);
      const melee = new MeleeAttack({ entity: owner, simulation, config }, {
            damage: 20, pose: "attack", sound: "swing", hitSound: "contact",
            hitbox: { width: 30, height: 20, offset: { x: 50, y: 0 } },
      });
      return { simulation, owner, enemy, melee, fighter };
}

describe("scoped melee attacks", () => {
      it("hits each overlapping enemy once per swing without sharing impact cooldown", () => {
            const { simulation, owner, enemy, melee, fighter } = fixture();
            const second = fighter("second", "B", 150, 105);
            const ally = fighter("ally", "A", 150, 100);
            const untagged = fighter("untagged", "B", 150, 100);
            untagged.tags.delete("targetable");
            simulation.hit(owner, enemy, { damage: 5 });
            const scope = new ScriptScope();
            const operation = melee.start(enemy, 100);
            expect(enemy.health).toBe(95);
            expect(operation.start(scope)).toBe(true);
            operation.advance(50);
            expect(operation.advance(100)).toBe(50);
            expect(operation.isComplete).toBe(true);
            expect(enemy.health).toBe(75);
            expect(second.health).toBe(80);
            expect(ally.health).toBe(100);
            expect(untagged.health).toBe(100);
            scope.release();
            expect(owner.presentation.pose).toBeNull();
            const next = melee.start(100);
            const nextScope = new ScriptScope();
            expect(next.start(nextScope)).toBe(true);
            expect(enemy.health).toBe(55);
            nextScope.release();
            simulation.dispose();
      });

      it("mirrors Studio offsets, corrects body offsets, and follows rotation during a swing", () => {
            const { simulation, owner, enemy, melee } = fixture();
            expect(melee.inRange(enemy)).toBe(true);
            Body.setPosition(enemy.body, { x: 50, y: 100 });
            expect(melee.inRange(enemy)).toBe(false);
            owner.facing = "left";
            expect(melee.inRange(enemy)).toBe(true);
            const operation = melee.start(enemy, 100);
            const scope = new ScriptScope();
            expect(operation.start(scope)).toBe(true);
            const entered = new Entity({ runtimeId: "entered", configId: "entered", teamId: "B", config,
                  body: Bodies.circle(100, 150, 10) });
            simulation.add(entered);
            owner.facing = "right";
            const releaseRotation = owner.presentation.acquireRotation(Math.PI / 2);
            operation.advance(25);
            expect(entered.health).toBe(80);
            operation.cancel("interrupted");
            const afterCancel = new Entity({ runtimeId: "late", configId: "late", teamId: "B", config,
                  body: Bodies.circle(100, 150, 10) });
            simulation.add(afterCancel);
            operation.advance(25);
            expect(afterCancel.health).toBe(100);
            scope.release();
            releaseRotation.release();
            simulation.dispose();
      });

      it("uses padding only for range admission and rejects invalid or retired targets", () => {
            const { simulation, enemy, melee } = fixture();
            Body.setPosition(enemy.body, { x: 185, y: 100 });
            expect(melee.inRange(enemy)).toBe(false);
            expect(melee.inRange(enemy, 15)).toBe(true);
            const scope = new ScriptScope();
            const operation = melee.start(enemy, 100);
            expect(operation.start(scope)).toBe(true);
            expect(enemy.health).toBe(100);
            scope.release();
            simulation.remove(enemy.runtimeId);
            expect(melee.inRange(enemy, 100)).toBe(false);
            expect(melee.start(enemy, 100).start(new ScriptScope())).toBe(false);
            simulation.dispose();
      });
});
