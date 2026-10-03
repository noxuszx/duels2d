import { readFileSync } from "node:fs";
import { Engine, World } from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { AbilitySystem } from "../src/abilities/ability-system";
import { composeFighter } from "../src/config/fighter-config";
import { Fighter } from "../src/entities/fighter";

function babyArena() {
      const defaults = JSON.parse(readFileSync("config/fighters/defaults.json", "utf8"));
      const definition = JSON.parse(readFileSync("config/fighters/babyman.json", "utf8"));
      const config = composeFighter(defaults, definition);
      config.image = null;
      config.poses = null;
      const game = JSON.parse(readFileSync("config/game-settings.json", "utf8"));
      const sounds = { shared: {}, characters: {} };
      let now = 0;
      const source = new Fighter(config, 100, 100, 0, 0, game, sounds, () => now);
      const targetConfig = composeFighter(defaults, { id: "target", name: "Target", color: "red" });
      const target = new Fighter(targetConfig, 300, 100, 0, 0, game, sounds, () => now);
      const engine = Engine.create({ gravity: { x: 0, y: 0 } });
      World.add(engine.world, [source.body, target.body]);
      const host = {
            characters: [source, target], projectiles: [], world: engine.world,
            COLLISION_COOLDOWN: 0, ARENA_BORDER: 0, now: () => now,
            indicators: {
                  spawnDamageIndicator: vi.fn(),
                  spawnHitSpark: vi.fn(),
                  spawnCharacterLine: vi.fn(),
            },
      };
      const system = new AbilitySystem(host as never);
      const step = (deltaMs: number) => { now += deltaMs; system.update(deltaMs); };
      return { source, target, system, step, host };
}

describe("Baby Man scripted wall charge", () => {
      it("owns crawl and dash through the ability phases and applies configured hit effects", () => {
            const { source, target, system, step } = babyArena();
            const response = system.handleWallCollision(
                  source,
                  "left",
                  { minX: 0, maxX: 500, minY: 0, maxY: 500 },
                  false,
            );

            expect(response).toEqual({ defaultBounce: false, allowImpactDamage: false });
            expect(source.abilities.state).toBe("windup");
            expect(system.isWallCrawling(source)).toBe(true);
            step(1_999);
            expect(system.isWallCrawling(source)).toBe(true);
            expect(source.abilities.state).toBe("windup");

            step(1);
            expect(system.isWallCrawling(source)).toBe(false);
            expect(system.isDashing(source)).toBe(true);
            system.handleCharacterCollision(source, target);
            expect(target.currentHealth).toBe(925);
            expect(source.abilities.state).toBe("idle");
            expect(system.isDashing(source)).toBe(false);
      });

      it("does not dash toward the initial target after it is removed", () => {
            const { source, target, system, step, host } = babyArena();
            system.handleWallCollision(source, "right", {
                  minX: 0, maxX: 500, minY: 0, maxY: 500,
            }, false);
            host.characters.splice(host.characters.indexOf(target), 1);

            step(2_000);

            expect(system.isWallCrawling(source)).toBe(false);
            expect(system.isDashing(source)).toBe(false);
            expect(source.abilities.state).toBe("idle");
      });

      it("does not start a second crawl on the wall collision that ends its dash", () => {
            const { source, system, step } = babyArena();
            const bounds = { minX: 0, maxX: 500, minY: 0, maxY: 500 };
            system.handleWallCollision(source, "left", bounds, false);
            step(2_000);
            expect(system.isDashing(source)).toBe(true);

            const response = system.handleWallCollision(source, "right", bounds, true);

            expect(response).toEqual({ defaultBounce: true, allowImpactDamage: false });
            expect(source.abilities.state).toBe("idle");
            expect(system.isWallCrawling(source)).toBe(false);
            expect(system.isDashing(source)).toBe(false);
      });
});
