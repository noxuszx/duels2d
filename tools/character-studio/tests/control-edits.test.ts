import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../../../src/config/fighter-config";
import type {
      ControlName,
      NumericInput,
      StudioConfig,
} from "../app/editor-types";
import {
      applyControlEdit,
      type ControlEditHost,
} from "../panels/control-edits";
import { _getPoseVisual, _setPoseVisual } from "../document/pose-model";

function fixture() {
      const defaults = JSON.parse(
            readFileSync("config/fighters/defaults.json", "utf8"),
      );
      const definition = JSON.parse(
            readFileSync("config/fighters/granny.json", "utf8"),
      );
      const config = composeFighter(defaults, definition) as StudioConfig;
      config.poses = { attackActive: "sprite.png" };
      const controls = new Proxy({} as Record<ControlName, NumericInput>, {
            get(target, key: ControlName) {
                  return (target[key] ??= { value: "0" } as NumericInput);
            },
      });
      const host = {
            controls,
            activePoseKey: "attackActive",
            mode: "default",
            canvas: { width: 500, height: 500 },
            images: {
                  body: {
                        complete: true,
                        naturalWidth: 100,
                        naturalHeight: 100,
                  },
            },
            hitboxType: { value: "box" },
            cropDraft: null,
            hitboxDraft: null,
            hitboxDraftOffset: null,
            _currentConfig: () => config,
            _poseBank: () => config.poses!,
            _getPoseImagePath: () => "sprite.png",
            _getPoseVisual: (document: StudioConfig, key: string) =>
                  _getPoseVisual(host, document, key),
            _setPoseVisual: (
                  document: StudioConfig,
                  key: string,
                  patch: Parameters<typeof _setPoseVisual>[3],
            ) => _setPoseVisual(host, document, key, patch),
            _swingAction: () => null,
            _attackHitboxAction: () => null,
            _refreshLabels: vi.fn(),
      } as unknown as ControlEditHost & {
            _poseBank(): NonNullable<StudioConfig["poses"]>;
            _getPoseImagePath(): string;
      };
      return { config, host, controls };
}

describe("control edits", () => {
      it("does not write inherited sprite overrides or body geometry when changing health bar controls", () => {
            const { config, host, controls } = fixture();
            const original = structuredClone(config.hitbox);
            controls.healthBarOffsetX.value = "12";
            controls.healthBarOffsetY.value = "-9";
            applyControlEdit(host, "healthBarOffsetX");
            expect(config.healthBarOffset).toEqual({ x: 12, y: -9 });
            expect(config.poses!.attackActive).toBe("sprite.png");
            expect(config.hitbox).toEqual(original);
      });
      it("keeps crop slider edits in the draft and clamps them to the loaded image", () => {
            const { config, host, controls } = fixture();
            host.mode = "crop";
            host.cropDraft = { x: 0, y: 0, width: 100, height: 100 };
            controls.imageCropX.value = "90";
            controls.imageCropY.value = "20";
            controls.imageCropWidth.value = "40";
            controls.imageCropHeight.value = "40";
            applyControlEdit(host, "imageCropWidth");
            expect(host.cropDraft).toEqual({
                  x: 90,
                  y: 20,
                  width: 10,
                  height: 40,
            });
            expect(controls.imageCropWidth.value).toBe(10);
            expect(config.poses!.attackActive).toBe("sprite.png");
      });
      it("keeps body hitbox slider edits in the draft until apply", () => {
            const { config, host, controls } = fixture();
            const original = structuredClone(config.hitbox);
            host.mode = "hitbox";
            host.hitboxDraft = { type: "box", width: 20, height: 30 };
            host.hitboxDraftOffset = { x: 0, y: 0 };
            controls.hitboxWidth.value = "70";
            controls.hitboxHeight.value = "80";
            applyControlEdit(host, "hitboxWidth");
            expect(host.hitboxDraft).toEqual({
                  type: "box",
                  width: 70,
                  height: 80,
            });
            expect(config.hitbox).toEqual(original);
            expect(config.poses!.attackActive).toBe("sprite.png");
      });
      it("editing sprite scale creates only the scale override", () => {
            const { config, host, controls } = fixture();
            controls.imageScale.value = "2";
            applyControlEdit(host, "imageScale");
            expect(config.poses!.attackActive).toEqual({
                  image: "sprite.png",
                  imageScale: 2,
            });
      });
      it("creates a crop override when initial imageCrop is null and user adjusts crop sliders", () => {
            const { config, host, controls } = fixture();
            config.imageCrop = null;
            expect(host._getPoseVisual(config, host.activePoseKey).imageCrop).toBeNull();
            controls.imageCropX.value = "10";
            controls.imageCropY.value = "15";
            controls.imageCropWidth.value = "50";
            controls.imageCropHeight.value = "60";
            applyControlEdit(host, "imageCropWidth");
            expect(host._getPoseVisual(config, host.activePoseKey).imageCrop).toEqual({
                  x: 10,
                  y: 15,
                  width: 50,
                  height: 60,
            });
            expect(controls.imageCropWidth.value).toBe(50);
      });
});
