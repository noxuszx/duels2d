import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../src/config/fighter-config";
import type { FighterDefaults, FighterDefinition } from "../src/types/fighter";
import type { StudioConfig } from "../tools/character-studio/app/editor-types";
import { EditorSession } from "../tools/character-studio/app/editor-session";
import { CharacterStudio } from "../tools/character-studio/app/studio-app";
import {
      createForm,
      poseBank,
} from "../tools/character-studio/document/form-model";
import { snapshotStudioState } from "../tools/character-studio/app/editor-history";
import { getSaveContent } from "../tools/character-studio/persistence/fighter-serializer";
import {
      attackHitboxRect,
      movedAttackOffset,
} from "../tools/character-studio/tools/attack-hitbox/attack-hitbox-geometry";
import { poseLabel } from "../tools/character-studio/document/pose-label";
import { parseComponents, parseMoves } from "../tools/character-studio/panels/form-panel";

const defaults: FighterDefaults = JSON.parse(
      readFileSync("config/fighters/defaults.json", "utf8"),
);
function granny() {
      const definition: FighterDefinition = JSON.parse(
            readFileSync("config/fighters/granny.json", "utf8"),
      );
      return {
            definition,
            config: composeFighter(defaults, definition) as StudioConfig,
      };
}

describe("Studio idle selection", () => {
      afterEach(() => vi.unstubAllGlobals());

      function idleOptions(config: StudioConfig, form: "base" | "transformed") {
            vi.stubGlobal("document", {
                  createElement: () => ({ value: "", textContent: "" }),
            });
            const select = {
                  innerHTML: "",
                  value: "",
                  options: [] as Array<{ value: string; textContent: string }>,
                  appendChild(option: { value: string; textContent: string }) {
                        this.options.push(option);
                  },
            };
            const studio = Object.assign(
                  Object.create(CharacterStudio.prototype),
                  {
                        session: new EditorSession([config]),
                        configs: [config],
                        activeConfigIndex: 0,
                        activeForm: form,
                        activePoseKey: "base",
                        poseSelect: select,
                        _updatePoseActionButtons: () => {},
                  },
            ) as CharacterStudio;
            studio._populatePoseSelect(config);
            return { options: select.options, selected: studio.activePoseKey };
      }

      it("shows the authored idle instead of a duplicate Default entry", () => {
            const { options, selected } = idleOptions(granny().config, "base");
            expect(
                  options.filter((option) => option.textContent === "Idle"),
            ).toEqual([{ value: "idle", textContent: "Idle" }]);
            expect(options.some((option) => option.value === "base")).toBe(
                  false,
            );
            expect(selected).toBe("idle");
      });

      it("labels the fallback Idle for fighters without a dedicated idle pose", () => {
            const { config } = granny();
            delete config.poses!.idle;
            const { options, selected } = idleOptions(config, "base");
            expect(
                  options.filter((option) => option.textContent === "Idle"),
            ).toEqual([{ value: "base", textContent: "Idle" }]);
            expect(selected).toBe("base");
      });

      it("keeps transformed Idle separate from the base fallback", () => {
            const { options, selected } = idleOptions(
                  granny().config,
                  "transformed",
            );
            expect(
                  options.filter((option) => option.textContent === "Idle"),
            ).toHaveLength(1);
            expect(selected).toBe("idle");
            expect(options.some((option) => option.value === "base")).toBe(
                  false,
            );
      });

      it("formats custom pose labels without changing their option keys", () => {
            const { options } = idleOptions(granny().config, "transformed");
            expect(options).toContainEqual({
                  value: "realization",
                  textContent: "Realization",
            });
            expect(options).toContainEqual({
                  value: "rage",
                  textContent: "Rage",
            });
            expect(poseLabel("power_up")).toBe("Power Up");
            expect(poseLabel("pre-transformation")).toBe("Pre Transformation");
            expect(poseLabel("powerUp")).toBe("Power Up");
      });
});

describe("Studio form editing", () => {
      it("creates independent component, move, and pose banks for a named form", () => {
            const { config } = granny();
            config.forms.example = createForm(config);
            expect(config.forms.example.components).toEqual(config.components);
            expect(config.forms.example.components).not.toBe(config.components);
            expect(config.forms.example.moves).not.toBe(config.moves);
            expect(config.forms.example.poses).not.toBe(config.poses);
      });

      it("edits a selected form without changing base art or melee geometry", () => {
            const { config } = granny();
            const studio = Object.assign(Object.create(CharacterStudio.prototype), {
                  session: new EditorSession([config]), activeForm: "transformed",
            }) as CharacterStudio;
            const base = structuredClone({ poses: config.poses, components: config.components });
            studio._setPoseVisual(config, "realization", { imageScale: 3.5, imageCrop: null });
            studio._setPoseImagePath(config, "idle", "assets/fighters/granny/sprites/granny-recoil.png");
            const hitbox = studio._attackHitboxAction();
            if (hitbox) hitbox.offset = { x: -15, y: 42 };
            expect(studio._getPoseVisual(config, "realization").imageScale).toBe(3.5);
            expect(studio._getPoseImagePath(config, "idle")).toContain("granny-recoil");
            expect({ poses: config.poses, components: config.components }).toEqual(base);
      });

      it("round-trips form components, moves, sequence, visuals, and body offset", () => {
            const { config, definition } = granny();
            config.forms.transformed.sequence![0].durationMs = 950;
            config.forms.transformed.poses!.realization = {
                  image: "assets/fighters/granny/sprites/granny-pre-trans.png",
                  imageScale: 3, imageOffset: { x: 12, y: -8 }, imageCrop: null,
            };
            config.forms.transformed.components.projectile!.projectile.rotationSpeed = 2;
            config.hitboxOffset = { x: -20, y: 30 };
            const saved: FighterDefinition = JSON.parse(getSaveContent([definition], config, defaults));
            const reloaded = composeFighter(defaults, saved);
            expect(reloaded.forms.transformed).toEqual(config.forms.transformed);
            expect(reloaded.hitboxOffset).toEqual({ x: -20, y: 30 });
            expect(reloaded.components).toEqual(config.components);
            expect(reloaded.moves).toEqual(config.moves);
      });

      it("preserves explicit empty form maps and inherits omitted maps", () => {
            const { config, definition } = granny();
            config.forms.transformed.components = {};
            config.forms.transformed.moves = {};
            config.forms.transformed.poses = {};
            const saved: FighterDefinition = JSON.parse(getSaveContent([definition], config, defaults));
            expect(saved.forms?.transformed).toMatchObject({ components: {}, moves: {}, poses: {} });
            const disabled = composeFighter(defaults, saved).forms.transformed;
            expect(disabled.components).toEqual({});
            expect(disabled.moves).toEqual({});
            expect(disabled.poses).toEqual({});

            saved.forms!.transformed = {};
            const inherited = composeFighter(defaults, saved).forms.transformed;
            expect(inherited.components).toEqual(config.components);
            expect(inherited.moves).toEqual(config.moves);
            expect(inherited.poses).toEqual(composeFighter(defaults, saved).poses);
      });

      it("saves a radius-only edit when the source has no body object", () => {
            const definition: FighterDefinition = { id: "radius-only", name: "Radius Only", color: "#336699" };
            const config = composeFighter(defaults, definition) as StudioConfig;
            config.radius += 7;
            config.lines = { greeting: ["Hello"] };
            const saved: FighterDefinition = JSON.parse(getSaveContent([definition], config, defaults));
            expect(saved.body).toEqual({ radius: config.radius });
            expect(saved.lines).toEqual(config.lines);
            expect(composeFighter(defaults, saved).radius).toBe(config.radius);
      });

      it("preserves flat combat, radius, and weapon art across undo and save", () => {
            const { config, definition } = granny();
            const session = new EditorSession([config]);
            session.resetHistory();
            const original = { maxHealth: config.maxHealth, speed: config.speed, baseDamage: config.baseDamage,
                  faceTarget: structuredClone(config.faceTarget), radius: config.radius, weaponAttack: config.weaponAttack };
            config.maxHealth += 125;
            config.speed += 2;
            config.baseDamage += 11;
            config.faceTarget = { mode: "never" };
            config.radius += 3;
            config.weaponAttack = "assets/fighters/granny/sprites/granny-recoil.png";
            session.commit();
            session.undo();
            expect({ maxHealth: config.maxHealth, speed: config.speed, baseDamage: config.baseDamage,
                  faceTarget: config.faceTarget, radius: config.radius, weaponAttack: config.weaponAttack }).toEqual(original);
            session.redo();
            const saved: FighterDefinition = JSON.parse(getSaveContent([definition], config, defaults));
            const reloaded = composeFighter(defaults, saved);
            expect(reloaded.maxHealth).toBe(config.maxHealth);
            expect(reloaded.speed).toBe(config.speed);
            expect(reloaded.baseDamage).toBe(config.baseDamage);
            expect(reloaded.faceTarget).toEqual(config.faceTarget);
            expect(reloaded.radius).toBe(config.radius);
            expect(reloaded.weaponAttack).toBe(config.weaponAttack);
      });

      it("captures form edits in history and removes deleted forms from JSON", () => {
            const { config, definition } = granny();
            const originalDuration = config.forms.transformed.sequence![0].durationMs;
            const snapshot = snapshotStudioState(config, "rage", "transformed");
            config.forms.transformed.sequence![0].durationMs = 100;
            const state = JSON.parse(snapshot);
            expect(state.activeForm).toBe("transformed");
            expect(state.forms.transformed.sequence[0].durationMs).toBe(originalDuration);
            const session = new EditorSession([config]);
            session.resetHistory();
            delete config.forms.transformed;
            session.commit();
            expect(JSON.parse(getSaveContent([definition], config, defaults)).forms).toBeUndefined();
            session.undo();
            expect(config.forms.transformed).toBeDefined();
            session.redo();
            expect(config.forms.transformed).toBeUndefined();
      });
});

describe("Studio attack hitbox positioning", () => {
      const action = {
            type: "attack-hitbox" as const,
            width: 52,
            height: 120,
            offset: { x: 58, y: 10 },
      };
      it("previews forward offsets on the appropriate side of the fighter", () => {
            expect(
                  attackHitboxRect({ x: 256, y: 256 }, action, "right"),
            ).toEqual({ x: 288, y: 206, width: 52, height: 120 });
            expect(attackHitboxRect({ x: 256, y: 256 }, action, "left").x).toBe(
                  172,
            );
      });
      it("converts canvas dragging to facing-relative offsets", () => {
            expect(
                  movedAttackOffset(action.offset, { x: 20, y: -30 }, "right"),
            ).toEqual({ x: 78, y: -20 });
            expect(
                  movedAttackOffset(action.offset, { x: 20, y: -30 }, "left"),
            ).toEqual({ x: 38, y: -20 });
            expect(action.offset).toEqual({ x: 58, y: 10 });
      });
});


describe("Studio component and move JSON", () => {
      it("rejects malformed or unknown component settings without changing a fighter", () => {
            const { config } = granny();
            const before = structuredClone(config.components);
            expect(() => parseComponents("[1,2]")).toThrow("components: expected object");
            expect(() => parseComponents('{"unknown":{}}')).toThrow("unknown");
            expect(() => parseComponents('{"melee":null}')).toThrow("melee");
            expect(() => parseComponents('{"wallCrawl":{"durationMs":-1,"speedMultiplier":1,"poses":["a","b"],"poseIntervalMs":100}}'))
                  .toThrow("durationMs");
            expect(config.components).toEqual(before);
      });
      it("accepts named move timing and rejects invalid cooldowns", () => {
            expect(parseMoves('{"strike":{"cooldownMs":300,"windupMs":80}}'))
                  .toEqual({ strike: { cooldownMs: 300, windupMs: 80 } });
            expect(() => parseMoves('{"strike":{"cooldownMs":-1}}')).toThrow("cooldownMs");
      });
});
