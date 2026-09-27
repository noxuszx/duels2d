import { describe, expect, it, vi } from "vitest";
import { executeDamageAction } from "../src/abilities/actions/damage-action";
import { FighterAbilities } from "../src/entities/fighter-abilities";
import { Projectile } from "../src/entities/projectile";
import type { AbilityConfig } from "../src/abilities/types";

describe("simulation timing", () => {
      it("uses the context clock for direct damage", () => {
            const takeDamage = vi.fn(() => true);
            const target = {
                  takeDamage,
                  playSound: vi.fn(),
                  body: { position: { x: 0, y: 0 } },
                  config: { color: "red" },
            };
            const indicators = {
                  spawnDamageIndicator: vi.fn(),
                  spawnHitSpark: vi.fn(),
                  spawnCharacterLine: vi.fn(),
            };

            executeDamageAction(
                  { type: "damage", amount: 12 },
                  {} as never,
                  target as never,
                  {
                        world: {} as never,
                        projectiles: [],
                        indicators: indicators as never,
                        COLLISION_COOLDOWN: 300,
                        now: () => 1_250,
                  },
            );

            expect(takeDamage).toHaveBeenCalledWith(12, 1_250, 300);
      });

      it("measures ability cooldowns only from supplied simulation time", () => {
            const ability: AbilityConfig = {
                  id: "test",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 1_000,
                        windupFrames: 0,
                        activeFrames: 1,
                        recoveryFrames: 0,
                  },
                  actions: [],
            };
            const runtime = new FighterAbilities();
            runtime.start(ability, "right", 500);

            expect(runtime.canUse(ability, 1_499)).toBe(false);
            expect(runtime.canUse(ability, 1_500)).toBe(true);
      });

      it("ages projectiles only when the simulation advances", () => {
            const projectile = new Projectile(
                  {
                        radius: 2,
                        speed: 1,
                        damage: 1,
                        lifetimeMs: 1_000,
                        rotationSpeed: 0.1,
                        image: "",
                  },
                  { id: "owner" },
                  0,
                  0,
                  1,
                  0,
            );

            projectile.update(999);
            expect(projectile.expired).toBe(false);
            projectile.update(1);
            expect(projectile.expired).toBe(true);
            expect(projectile.angle).toBeCloseTo(6);
      });
});
