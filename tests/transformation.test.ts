import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Fighter } from "../src/entities/fighter";
import type { GameConfig } from "../src/types/game";
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
      it("plays each sequence pose to its boundary before enabling transformed state", () => {
            const controller = new TransformationController({
                  ...transformation,
                  sequence: [
                        { pose: "realization", durationMs: 600 },
                        { pose: "rage", durationMs: 800 },
                  ],
            });
            expect(controller.update(40, 100, 8)).toBe(true);
            expect(controller.isTransforming).toBe(true);
            expect(controller.currentPose).toBe("realization");
            controller.update(40, 100, 599);
            expect(controller.currentPose).toBe("realization");
            controller.update(40, 100, 1);
            expect(controller.currentPose).toBe("rage");
            controller.update(40, 100, 800);
            expect(controller.isTransformed).toBe(true);
            expect(controller.currentPose).toBeNull();
            controller.reset();
            expect(controller.currentState).toBe("base");
            expect(controller.transform()).toBe(true);
            controller.update(40, 100, 1400);
            expect(controller.isTransformed).toBe(true);
      });
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

describe("Granny transformation integration", () => {
      afterEach(() => vi.unstubAllGlobals());

      it("interrupts melee, shows realization and rage, then enables shotgun and resets", () => {
            class LoadedImage {
                  onload: (() => void) | null = null;
                  onerror: (() => void) | null = null;
                  naturalWidth = 100;
                  naturalHeight = 100;
                  private path = "";
                  set src(value: string) { this.path = value; this.onload?.(); }
                  get src() { return this.path; }
            }
            vi.stubGlobal("Image", LoadedImage);
            const defaults = JSON.parse(readFileSync("config/fighters/defaults.json", "utf8"));
            const definition = JSON.parse(readFileSync("config/fighters/granny.json", "utf8"));
            const config = composeFighter(defaults, definition);
            const game = JSON.parse(readFileSync("config/game-settings.json", "utf8")) as GameConfig;
            const fighter = new Fighter(config, 0, 0, 2, 0, game,
                  { shared: {}, characters: {} }, () => 0);
            const target = { body: { position: { x: 200, y: -30 } }, isDead: false } as Fighter;
            expect(config.skills?.aim).toBeUndefined();
            expect(config.transformation?.skills?.aim).toBeDefined();
            fighter.updateAim(target);
            expect(fighter.aimSkill?.current).toBeNull();
            const baseAbility = fighter.activeAbilities[0];
            fighter.abilities.tryStart(baseAbility, "left", 0);
            fighter.currentHealth = 400;
            fighter.updateTransformation(8);
            expect(fighter.abilities.active).toBeNull();
            expect(fighter.canStartAbility()).toBe(false);
            expect(fighter.presentation.getCurrentSprite("idle")?.image.src)
                  .toContain("granny-pre-trans.png");
            fighter.updateAim(target);
            expect(fighter.aimSkill?.current).toBeNull();
            fighter.updateTransformation(config.transformation!.sequence![0].durationMs);
            expect(fighter.presentation.getCurrentSprite("idle")?.image.src)
                  .toContain("granny-trans.png");
            fighter.updateAim(target);
            expect(fighter.aimSkill?.current).toBeNull();
            fighter.updateTransformation(config.transformation!.sequence![1].durationMs);
            expect(fighter.canStartAbility()).toBe(true);
            expect(fighter.activeAbilities[0].id).toBe("shotgun-blast");
            expect(fighter.presentation.getCurrentSprite("idle")?.image.src)
                  .toContain("granny-shotgun.png");
            expect(fighter.presentation.getCurrentSprite("recovery")?.image.src)
                  .toContain("granny-recoil.png");
            fighter.updateAim(target);
            expect(fighter.aimSkill?.current).not.toBeNull();
            fighter.resetTransformation();
            expect(fighter.aimSkill?.current).toBeNull();
            fighter.updateAim(target);
            expect(fighter.aimSkill?.current).toBeNull();
            expect(fighter.activeAbilities[0].id).toBe("rolling-pin-strike");
            expect(fighter.presentation.getCurrentSprite("idle")?.image.src)
                  .toContain("granny-idle.png");
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
