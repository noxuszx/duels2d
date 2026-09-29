import { describe, expect, it } from "vitest";
import { composeFighter } from "../src/config/fighter-config";
import { TransformationController } from "../src/transformations";
import type {
      FighterDefaults,
      FighterTransformationConfig,
} from "../src/types/fighter";

const transformation: FighterTransformationConfig = {
      trigger: { type: "health-threshold", healthRatio: 0.4 },
      abilities: [],
      poses: null,
};

describe("TransformationController", () => {
      it("transforms once when health reaches the configured ratio", () => {
            const controller = new TransformationController(transformation);

            expect(controller.update(41, 100)).toBe(false);
            expect(controller.currentState).toBe("base");
            expect(controller.update(40, 100)).toBe(true);
            expect(controller.isTransformed).toBe(true);
            expect(controller.update(20, 100)).toBe(false);
      });

      it("does not automatically transform a dead fighter", () => {
            const controller = new TransformationController(transformation);

            expect(controller.update(0, 100)).toBe(false);
            expect(controller.isTransformed).toBe(false);
      });

      it("supports explicit transformation and reset for future triggers", () => {
            const controller = new TransformationController(transformation);

            expect(controller.transform()).toBe(true);
            expect(controller.transform()).toBe(false);
            controller.reset();
            expect(controller.currentState).toBe("base");
      });

      it("stays in the base state when no transformation is configured", () => {
            const controller = new TransformationController(null);

            expect(controller.transform()).toBe(false);
            expect(controller.update(1, 100)).toBe(false);
      });
});

describe("transformation configuration", () => {
      const defaults: FighterDefaults = {
            combat: {
                  maxHealth: 100,
                  speed: 5,
                  baseDamage: 10,
                  abilities: [],
                  faceTarget: { mode: "never" },
            },
            body: {
                  radius: 30,
                  hitbox: { type: "box", width: 40, height: 60 },
                  hitboxOffset: { x: 0, y: 0 },
            },
            presentation: {
                  image: null,
                  imageScale: 2,
                  imageOffset: { x: 1, y: 2 },
                  imageCrop: null,
                  healthBarOffset: { x: 0, y: -50 },
                  weaponScale: 1,
                  weaponOffset: { x: 0, y: 0 },
                  weaponPivot: { x: 0, y: 0 },
                  weaponIdle: null,
                  weaponAttack: null,
                  poses: null,
                  defaultFacing: "right",
            },
            lines: {},
      };

      it("composes transformed abilities and materializes transformed poses", () => {
            const transformedAbility = {
                  id: "transformed-attack",
                  trigger: { type: "nearest-enemy" as const },
                  timing: {
                        cooldownMs: 100,
                        windupMs: 10,
                        activeMs: 10,
                        recoveryMs: 10,
                  },
                  actions: [{ type: "damage" as const, amount: 20 }],
            };
            const fighter = composeFighter(defaults, {
                  id: "test-fighter",
                  name: "Test Fighter",
                  color: "#ffffff",
                  transformation: {
                        trigger: {
                              type: "health-threshold",
                              healthRatio: 0.5,
                        },
                        combat: { abilities: [transformedAbility] },
                        presentation: {
                              poses: { idle: "assets/transformed.png" },
                        },
                  },
            });

            expect(fighter.transformation?.abilities).toEqual([
                  transformedAbility,
            ]);
            expect(fighter.transformation?.poses?.idle).toEqual({
                  image: "assets/transformed.png",
                  imageScale: 2,
                  imageOffset: { x: 1, y: 2 },
                  imageCrop: null,
            });
      });
});
