import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../src/config/fighter-config";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";
import type { StudioConfig } from "../tools/character-studio/studio-types";
import { CharacterStudio } from "../tools/character-studio/studio-app";
import { createTransformation, poseBank } from "../tools/character-studio/transformation-tool";
import { snapshotStudioState } from "../tools/character-studio/studio-state";
import { getSaveContent } from "../tools/character-studio/fighter-file";
import { attackHitboxRect, movedAttackOffset } from "../tools/character-studio/attack-hitbox-tool";
import { poseLabel } from "../tools/character-studio/pose-label";

const defaults: FighterDefaults = JSON.parse(readFileSync("config/fighters/defaults.json", "utf8"));
function granny() {
      const definition: FighterDefinition = JSON.parse(readFileSync("config/fighters/granny.json", "utf8"));
      return { definition, config: composeFighter(defaults, definition) as StudioConfig };
}

describe("Studio idle selection", () => {
      afterEach(() => vi.unstubAllGlobals());

      function idleOptions(config: StudioConfig, form: "base" | "transformed") {
            vi.stubGlobal("document", { createElement: () => ({ value: "", textContent: "" }) });
            const select = {
                  innerHTML: "", value: "", options: [] as Array<{ value: string; textContent: string }>,
                  appendChild(option: { value: string; textContent: string }) { this.options.push(option); },
            };
            const studio = Object.assign(Object.create(CharacterStudio.prototype), {
                  configs: [config], activeConfigIndex: 0, activeForm: form,
                  activePoseKey: "base", poseSelect: select, _updatePoseActionButtons: () => {},
            }) as CharacterStudio;
            studio._populatePoseSelect(config);
            return { options: select.options, selected: studio.activePoseKey };
      }

      it("shows the authored idle instead of a duplicate Default entry", () => {
            const { options, selected } = idleOptions(granny().config, "base");
            expect(options.filter((option) => option.textContent === "Idle")).toEqual([{ value: "idle", textContent: "Idle" }]);
            expect(options.some((option) => option.value === "base")).toBe(false);
            expect(selected).toBe("idle");
      });

      it("labels the fallback Idle for fighters without a dedicated idle pose", () => {
            const { config } = granny();
            delete config.poses!.idle;
            const { options, selected } = idleOptions(config, "base");
            expect(options.filter((option) => option.textContent === "Idle")).toEqual([{ value: "base", textContent: "Idle" }]);
            expect(selected).toBe("base");
      });

      it("keeps transformed Idle separate from the base fallback", () => {
            const { options, selected } = idleOptions(granny().config, "transformed");
            expect(options.filter((option) => option.textContent === "Idle")).toHaveLength(1);
            expect(selected).toBe("idle");
            expect(options.some((option) => option.value === "base")).toBe(false);
      });

      it("formats custom pose labels without changing their option keys", () => {
            const { options } = idleOptions(granny().config, "transformed");
            expect(options).toContainEqual({ value: "realization", textContent: "Realization" });
            expect(options).toContainEqual({ value: "rage", textContent: "Rage" });
            expect(poseLabel("power_up")).toBe("Power Up");
            expect(poseLabel("pre-transformation")).toBe("Pre Transformation");
            expect(poseLabel("powerUp")).toBe("Power Up");
      });
});

describe("Studio transformation editing", () => {
      it("creates independent pose and ability banks when enabling a transformation", () => {
            const { config } = granny();
            config.transformation = createTransformation(config);
            expect(config.transformation.abilities).toEqual(config.abilities);
            expect(config.transformation.abilities).not.toBe(config.abilities);
            expect(config.transformation.abilities[0].actions).not.toBe(config.abilities[0].actions);
            expect(poseBank(config, "transformed").idle).not.toBe(poseBank(config, "base").idle);
      });

      it("routes sprite and attack editing to the selected form without changing base values", () => {
            const { config } = granny();
            const studio = Object.assign(Object.create(CharacterStudio.prototype), {
                  configs: [config], activeConfigIndex: 0, activeForm: "transformed",
            }) as CharacterStudio;
            const baseSnapshot = structuredClone({ poses: config.poses, abilities: config.abilities, image: config.image });
            studio._setPoseVisual(config, "realization", { imageScale: 3.5, imageCrop: null });
            studio._setPoseImagePath(config, "idle", "assets/fighters/granny/sprites/granny-recoil.png");
            expect(studio._getPoseVisual(config, "realization").imageScale).toBe(3.5);
            expect(studio._getPoseImagePath(config, "idle")).toContain("granny-recoil");
            expect(studio._editingAbilities()[0].id).toBe("shotgun-blast");
            expect({ poses: config.poses, abilities: config.abilities, image: config.image }).toEqual(baseSnapshot);
            studio.activeForm = "base";
            expect(studio._editingAbilities()[0].id).toBe("rolling-pin-strike");
            expect(studio._getPoseImagePath(config, "idle")).toContain("granny-idle");
      });

      it("round-trips sequence timing, custom sprite visuals, transformed projectiles and shared body offsets", () => {
            const { config, definition } = granny();
            config.transformation!.sequence![0].durationMs = 950;
            config.transformation!.poses!.realization = {
                  image: "assets/fighters/granny/sprites/granny-pre-trans.png",
                  imageScale: 3, imageOffset: { x: 12, y: -8 }, imageCrop: null,
            };
            config.hitboxOffset = { x: -20, y: 30 };
            const action = config.transformation!.abilities[0].actions.find((action) => action.type === "spawn-projectile");
            if (action?.type === "spawn-projectile") action.projectile.rotationSpeed = 2;
            const saved: FighterDefinition = JSON.parse(getSaveContent([definition], config, defaults));
            const reloaded = composeFighter(defaults, saved);
            expect(reloaded.transformation).toEqual(config.transformation);
            expect(reloaded.hitboxOffset).toEqual({ x: -20, y: 30 });
            expect(reloaded.abilities).toEqual(config.abilities);
      });

      it("saves disabling transformation and captures isolated history for both forms", () => {
            const { config, definition } = granny();
            const snapshot = snapshotStudioState(config, "rage", "transformed");
            config.transformation!.sequence![0].durationMs = 100;
            const state = JSON.parse(snapshot);
            expect(state.activeForm).toBe("transformed");
            expect(state.activePoseKey).toBe("rage");
            expect(state.transformation.sequence[0].durationMs).toBe(600);
            config.transformation = null;
            expect(JSON.parse(getSaveContent([definition], config, defaults)).transformation).toBeUndefined();
      });

      it("preserves an explicitly empty transformed pose bank instead of re-inheriting base sprites", () => {
            const { config, definition } = granny();
            config.transformation!.poses = {};
            config.transformation!.sequence = [];
            const saved = JSON.parse(getSaveContent([definition], config, defaults));
            expect(saved.transformation.presentation.poses).toEqual({});
            expect(composeFighter(defaults, saved).transformation!.poses).toEqual({});
      });

      it("edits and saves the selected transformed attack hitbox without moving the base attack", () => {
            const { config, definition } = granny();
            config.transformation!.abilities = structuredClone(config.abilities);
            const studio = Object.assign(Object.create(CharacterStudio.prototype), {
                  configs: [config], activeConfigIndex: 0, activeForm: "transformed",
                  attackHitboxAbilitySelect: { value: "rolling-pin-strike" },
            }) as CharacterStudio;
            const hitbox = studio._attackHitboxAction()!;
            hitbox.offset = { x: -15, y: 42 };
            const base = config.abilities[0].actions.find((action) => action.type === "attack-hitbox");
            expect(base?.type === "attack-hitbox" && base.offset).toEqual({ x: 58, y: 0 });
            const saved = JSON.parse(getSaveContent([definition], config, defaults));
            expect(saved.transformation.combat.abilities[0].actions[0].offset).toEqual({ x: -15, y: 42 });
      });
});

describe("Studio attack hitbox positioning", () => {
      const action = { type: "attack-hitbox" as const, width: 52, height: 120, offset: { x: 58, y: 10 } };
      it("previews forward offsets on the appropriate side of the fighter", () => {
            expect(attackHitboxRect({ x: 256, y: 256 }, action, "right")).toEqual({ x: 288, y: 206, width: 52, height: 120 });
            expect(attackHitboxRect({ x: 256, y: 256 }, action, "left").x).toBe(172);
      });
      it("converts canvas dragging to facing-relative offsets", () => {
            expect(movedAttackOffset(action.offset, { x: 20, y: -30 }, "right")).toEqual({ x: 78, y: -20 });
            expect(movedAttackOffset(action.offset, { x: 20, y: -30 }, "left")).toEqual({ x: 38, y: -20 });
            expect(action.offset).toEqual({ x: 58, y: 10 });
      });
});
