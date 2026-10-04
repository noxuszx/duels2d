import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../../../src/config/fighter-config";
import type {
      FighterDefaults,
      FighterDefinition,
} from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";
import { drawStudio, type PreviewHost } from "../preview/preview-renderer";
import { installPreviewAnimation } from "../preview/preview-animation";
import { _onBodyImageLoaded } from "../assets/image-loader";
import {
      _applyCrop,
      _cancelCrop,
      _enterCropMode,
      type CropToolHost,
} from "../tools/crop/crop-tool";
import {
      cancelHitbox,
      enterHitboxMode,
      type HitboxToolHost,
} from "../tools/body-hitbox/body-hitbox-tool";
import {
      installStudioControls,
      syncStudioControls,
} from "../ui/studio-controls";

const defaults: FighterDefaults = JSON.parse(
      readFileSync("config/fighters/defaults.json", "utf8"),
);
function fixture() {
      const definition: FighterDefinition = JSON.parse(
            readFileSync("config/fighters/granny.json", "utf8"),
      );
      const config = composeFighter(defaults, definition) as StudioConfig;
      const control = () => ({ value: "0", disabled: false, max: "100" });
      const host = {
            canvas: { width: 500, height: 500 },
            activePoseKey: "base",
            mode: "default",
            pendingBodyImageRequest: 0,
            cropDraft: null,
            hitboxDraft: null,
            hitboxDraftOffset: null,
            dragState: null,
            images: {
                  body: {
                        complete: true,
                        naturalWidth: 200,
                        naturalHeight: 300,
                  },
            },
            controls: Object.fromEntries(
                  [
                        "imageCropX",
                        "imageCropY",
                        "imageCropWidth",
                        "imageCropHeight",
                        "hitboxWidth",
                        "hitboxHeight",
                        "hitboxRadius",
                        "hitboxOffsetX",
                        "hitboxOffsetY",
                  ].map((key) => [key, control()]),
            ),
            hitboxType: control(),
            applyCropBtn: control(),
            cancelCropBtn: control(),
            applyHitboxBtn: control(),
            cancelHitboxBtn: control(),
            hitboxOutput: control(),
            _currentConfig: () => config,
            _getPoseVisual: () => ({
                  imageScale: config.imageScale ?? 1,
                  imageOffset: config.imageOffset ?? { x: 0, y: 0 },
                  imageCrop: config.imageCrop ?? null,
            }),
            _setPoseVisual: (_: StudioConfig, __: string, patch: object) =>
                  Object.assign(config, patch),
            _ensureConfigShape: vi.fn(),
            _syncImageControls: vi.fn(),
            _refreshLabels: vi.fn(),
            _saveState: vi.fn(),
            _draw: vi.fn(),
      } as unknown as CropToolHost & HitboxToolHost;
      host._cancelCrop = () => _cancelCrop(host);
      host._cancelHitbox = () => cancelHitbox(host);
      return { host, config };
}

afterEach(() => vi.unstubAllGlobals());

describe("Studio preview and tool boundaries", () => {
      it.each(["left", "right"] as const)("previews the original %s-facing sprite without mirroring or changing the document", (facing) => {
            const { config, host } = fixture();
            config.defaultFacing = facing;
            config.imageCrop = { x: -20, y: 250, width: 900, height: 900 };
            delete (config as Partial<StudioConfig>).weaponOffset;
            delete (config as Partial<StudioConfig>).healthBarOffset;
            const before = structuredClone(config);
            const calls = vi.fn();
            const scale = vi.fn();
            const ctx = new Proxy(
                  {},
                  { get: (_, key) => key === "scale" ? scale : calls, set: () => true },
            ) as CanvasRenderingContext2D;
            const preview = Object.assign(host, {
                  ctx,
                  defaults,
                  images: {
                        ...host.images,
                        weaponIdle: { complete: false },
                        weaponAttack: { complete: false },
                        projectile: { complete: false },
                  },
                  indicatorConfig: {
                        text: {
                              fillColor: "white",
                              strokeColor: "black",
                              strokeWidth: 1,
                              family: "sans-serif",
                              weight: "400",
                              align: "center",
                              baseline: "middle",
                        },
                        health: { minFontSize: 12, sizeMultiplier: 1 },
                  },
                  _editingComponents: () => ({}),
                  _attackHitboxAction: () => null,
            }) as unknown as PreviewHost;
            drawStudio(preview);
            expect(config).toEqual(before);
            expect(host._ensureConfigShape).not.toHaveBeenCalled();
            expect(calls).toHaveBeenCalled();
            expect(scale).not.toHaveBeenCalled();
      });

      it("loading an image does not create an authored crop or history entry", () => {
            const { host, config } = fixture();
            config.imageCrop = null;
            const before = structuredClone(config);
            _onBodyImageLoaded(host, config, "base");
            expect(config).toEqual(before);
            expect(host.controls.imageCropWidth.max).toBe("200");
            expect(host._draw).toHaveBeenCalledOnce();
            expect(host._saveState).not.toHaveBeenCalled();
      });

      it("abandons the previous draft when switching tools and cancel never commits", () => {
            const { host, config } = fixture();
            const before = structuredClone(config);
            _enterCropMode(host);
            host.cropDraft!.width = 50;
            enterHitboxMode(host);
            expect(host.cropDraft).toBeNull();
            expect(host.applyCropBtn.disabled).toBe(true);
            host.hitboxDraftOffset = { x: 99, y: 99 };
            _enterCropMode(host);
            expect(host.hitboxDraft).toBeNull();
            expect(host.hitboxDraftOffset).toBeNull();
            expect(host.applyHitboxBtn.disabled).toBe(true);
            _cancelCrop(host);
            expect(host.mode).toBe("default");
            expect(Number(host.controls.imageCropWidth.value)).toBe(
                  config.imageCrop?.width ?? 200,
            );
            expect(config).toEqual(before);
            expect(host._saveState).not.toHaveBeenCalled();
      });

      it("clamps and commits a crop only on Apply", () => {
            const { host, config } = fixture();
            _enterCropMode(host);
            host.cropDraft = { x: -10, y: 295, width: 900, height: 900 };
            _applyCrop(host);
            expect(config.imageCrop).toEqual({
                  x: 0,
                  y: 295,
                  width: 200,
                  height: 5,
            });
            expect(host.cropDraft).toBeNull();
            expect(host._saveState).toHaveBeenCalledOnce();
      });

      it("installs controls without replacing host methods and synchronizes values explicitly", () => {
            const slider = Object.assign(new EventTarget(), {
                  value: "20",
                  min: "0",
                  max: "100",
                  disabled: false,
            });
            const number = Object.assign(new EventTarget(), {
                  value: "0",
                  min: "",
                  max: "",
                  disabled: false,
                  dataset: { for: "slider" },
            });
            const badge = { textContent: "", className: "" };
            vi.stubGlobal("document", {
                  activeElement: null,
                  querySelectorAll: (query: string) =>
                        query === ".num-input" ? [number] : [],
                  getElementById: (id: string) =>
                        id === "slider"
                              ? slider
                              : id === "mode-badge"
                                ? badge
                                : null,
            });
            const host = {
                  mode: "default" as "default" | "crop" | "hitbox",
                  _draw: vi.fn(),
                  undo: vi.fn(),
                  redo: vi.fn(),
                  _refreshLabels: vi.fn(),
            };
            const original = { ...host };
            installStudioControls(host);
            expect(host._refreshLabels).toBe(original._refreshLabels);
            expect(host._draw).toBe(original._draw);
            slider.value = "70";
            slider.max = "200";
            slider.disabled = true;
            host.mode = "crop";
            syncStudioControls(host);
            expect(number.value).toBe("70");
            expect(number.max).toBe("200");
            expect(number.disabled).toBe(true);
            expect(badge.className).toBe("mode-badge crop");
            number.value = "40";
            number.dispatchEvent(new Event("input"));
            expect(slider.value).toBe("40");
      });

      it("advances time without drawing a static projectile", () => {
            let callback: FrameRequestCallback = () => {};
            vi.stubGlobal("requestAnimationFrame", vi.fn((next) => { callback = next; return 7; }));
            vi.stubGlobal("cancelAnimationFrame", vi.fn());
            const host = { projectilePreviewTime: 0, projectilePreviewAngle: 0,
                  _projectileAction: () => ({
                        projectile: { radius: 4, speed: 1, damage: 1, flight: { collision: { response: "sensor" as const, enemyContact: "consume" as const, ownerContact: "ignore" as const, walls: "ignore" as const }, lifetime: { type: "duration" as const, durationMs: 200 }, ownership: { onOwnerDeath: "remove" as const, onOwnerRemoval: "remove" as const, onMatchEnd: "remove" as const } }, image: "weapon.png", rotationSpeed: 0 } }),
                  _draw: vi.fn() };
            const dispose = installPreviewAnimation(host);
            callback(16);
            expect(host.projectilePreviewTime).toBe(16);
            expect(host._draw).not.toHaveBeenCalled();
            dispose();
      });

      it("stops preview frames when disposed", () => {
            let callback: FrameRequestCallback = () => {};
            vi.stubGlobal(
                  "requestAnimationFrame",
                  vi.fn((next) => {
                        callback = next;
                        return 7;
                  }),
            );
            const cancel = vi.fn();
            vi.stubGlobal("cancelAnimationFrame", cancel);
            const host = {
                  projectilePreviewTime: 0,
                  projectilePreviewAngle: 0,
                  _projectileAction: () => null,
                  _draw: vi.fn(),
            };
            const dispose = installPreviewAnimation(host);
            callback(16);
            expect(host.projectilePreviewTime).toBe(16);
            dispose();
            callback(32);
            expect(cancel).toHaveBeenCalledWith(7);
            expect(host.projectilePreviewTime).toBe(16);
      });
});
