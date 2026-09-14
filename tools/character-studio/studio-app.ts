// Coordinates Studio dependencies, selection, and high-level editor actions.
import type { IndicatorConfig } from "../../src/types/game";
import type {
      Facing,
      FighterConfig,
      FighterDefaults,
      FighterDefinition,
      Hitbox,
      ImageCrop,
      PoseConfig,
      Vector2,
} from "../../src/types/fighter";
import { numberValue, requireElement } from "./studio-elements";
import { drawStudio } from "./studio-renderer";
import {
      cleanForSave,
      downloadFighterFile,
      getSaveContent,
      syncFighterDefinition,
      writeFighterFile,
} from "./fighter-file";
import { appendHistory, snapshotStudioState } from "./studio-state";
import {
      _clampCrop,
      _loadBodyImage,
      _onBodyImageLoaded,
      _updateCropRanges,
      _syncCropControls,
      _updateCropButtons,
      _enterCropMode,
      _applyCrop,
      _cancelCrop,
} from "./crop-tool";
import { installCanvasToolController } from "./canvas-tool-controller";
import {
      applyHitbox,
      applyHitboxOutput,
      cancelHitbox,
      clampHitboxOffset,
      enterHitboxMode,
      getHitboxRect,
      getSafetyRect,
      refreshHitboxOutput,
      syncHitboxControls,
      syncHitboxControlState,
      syncHitboxOffsetControls,
      updateHitboxButtons,
      updateHitboxFromInputs,
} from "./hitbox-tool";
import type {
      ControlName,
      DragState,
      EditableHitbox,
      JSONValue,
      NumericInput,
      PosePatch,
      PoseVisual,
      StudioConfig,
      StudioFileHandle,
      StudioState,
} from "./studio-types";
declare global {
      interface Window {
            showSaveFilePicker?: (options: {
                  suggestedName: string;
                  types: Array<{
                        description: string;
                        accept: Record<string, string[]>;
                  }>;
            }) => Promise<StudioFileHandle>;
            __studioInstance?: CharacterStudio;
      }
}
export class CharacterStudio {
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      configs: StudioConfig[];
      activeConfigIndex: number;
      activePoseKey: string;
      history: string[];
      historyIndex: number;
      isRestoring: boolean;
      fileHandles: Map<string, StudioFileHandle>;
      mode: "default" | "crop" | "hitbox";
      cropDraft: ImageCrop | null;
      hitboxDraft: EditableHitbox | null;
      hitboxDraftOffset: Vector2 | null = null;
      dragState: DragState | null;
      pendingBodyImageRequest: number;
      select: HTMLSelectElement;
      poseSelect: HTMLSelectElement;
      defaultFacingSelect: HTMLSelectElement;
      resetPoseBtn: HTMLButtonElement;
      imageOutput: HTMLInputElement;
      hitboxType: HTMLSelectElement;
      editHitboxBtn: HTMLButtonElement;
      applyHitboxBtn: HTMLButtonElement;
      cancelHitboxBtn: HTMLButtonElement;
      cropBtn: HTMLButtonElement;
      applyCropBtn: HTMLButtonElement;
      cancelCropBtn: HTMLButtonElement;
      saveBtn: HTMLButtonElement;
      hitboxOutput: HTMLInputElement;
      controls: Record<ControlName, NumericInput>;
      labels: Record<ControlName, HTMLElement>;
      images: {
            body: HTMLImageElement;
            weaponIdle: HTMLImageElement;
            weaponAttack: HTMLImageElement;
      };
      constructor(
            configs: FighterConfig[],
            private readonly fighterDefinitions: FighterDefinition[],
            readonly indicatorConfig: IndicatorConfig,
            readonly defaults?: FighterDefaults,
      ) {
            this.canvas = requireElement<HTMLCanvasElement>("studio-canvas");
            const context = this.canvas.getContext("2d");
            if (!context)
                  throw new Error(
                        "Unable to create Character Studio canvas context",
                  );
            this.ctx = context;

            this.configs = configs;
            this.activeConfigIndex = 0;
            this.activePoseKey = "base";
            this.history = [];
            this.historyIndex = -1;
            this.isRestoring = false;
            this.fileHandles = new Map();
            this.mode = "default";
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.dragState = null;
            this.pendingBodyImageRequest = 0;

            this.select = requireElement<HTMLSelectElement>("char-select");
            this.poseSelect = requireElement<HTMLSelectElement>("pose-select");
            this.defaultFacingSelect =
                  requireElement<HTMLSelectElement>("defaultFacing");
            this.resetPoseBtn =
                  requireElement<HTMLButtonElement>("reset-pose-btn");
            this.imageOutput = requireElement<HTMLInputElement>("image-output");
            this.hitboxType = requireElement<HTMLSelectElement>("hitboxType");
            this.editHitboxBtn =
                  requireElement<HTMLButtonElement>("edit-hitbox-btn");
            this.applyHitboxBtn =
                  requireElement<HTMLButtonElement>("apply-hitbox-btn");
            this.cancelHitboxBtn =
                  requireElement<HTMLButtonElement>("cancel-hitbox-btn");
            this.cropBtn = requireElement<HTMLButtonElement>("crop-btn");
            this.applyCropBtn =
                  requireElement<HTMLButtonElement>("apply-crop-btn");
            this.cancelCropBtn =
                  requireElement<HTMLButtonElement>("cancel-crop-btn");
            this.saveBtn = requireElement<HTMLButtonElement>("save-config-btn");
            this.hitboxOutput =
                  requireElement<HTMLInputElement>("hitbox-output");

            this.controls = {
                  hitboxWidth: requireElement<NumericInput>("hitboxWidth"),
                  hitboxHeight: requireElement<NumericInput>("hitboxHeight"),
                  hitboxRadius: requireElement<NumericInput>("hitboxRadius"),
                  hitboxOffsetX: requireElement<NumericInput>("hitboxOffsetX"),
                  hitboxOffsetY: requireElement<NumericInput>("hitboxOffsetY"),
                  imageScale: requireElement<NumericInput>("imageScale"),
                  imageOffsetX: requireElement<NumericInput>("imageOffsetX"),
                  imageOffsetY: requireElement<NumericInput>("imageOffsetY"),
                  healthBarOffsetX:
                        requireElement<NumericInput>("healthBarOffsetX"),
                  healthBarOffsetY:
                        requireElement<NumericInput>("healthBarOffsetY"),
                  weaponScale: requireElement<NumericInput>("weaponScale"),
                  weaponOffsetX: requireElement<NumericInput>("weaponOffsetX"),
                  weaponOffsetY: requireElement<NumericInput>("weaponOffsetY"),
                  imageCropX: requireElement<NumericInput>("imageCropX"),
                  imageCropY: requireElement<NumericInput>("imageCropY"),
                  imageCropWidth:
                        requireElement<NumericInput>("imageCropWidth"),
                  imageCropHeight:
                        requireElement<NumericInput>("imageCropHeight"),
            };

            this.labels = {
                  hitboxWidth: requireElement("val-hitboxWidth"),
                  hitboxHeight: requireElement("val-hitboxHeight"),
                  hitboxRadius: requireElement("val-hitboxRadius"),
                  hitboxOffsetX: requireElement("val-hitboxOffsetX"),
                  hitboxOffsetY: requireElement("val-hitboxOffsetY"),
                  imageScale: requireElement("val-imageScale"),
                  imageOffsetX: requireElement("val-imageOffsetX"),
                  imageOffsetY: requireElement("val-imageOffsetY"),
                  healthBarOffsetX: requireElement("val-healthBarOffsetX"),
                  healthBarOffsetY: requireElement("val-healthBarOffsetY"),
                  weaponScale: requireElement("val-weaponScale"),
                  weaponOffsetX: requireElement("val-weaponOffsetX"),
                  weaponOffsetY: requireElement("val-weaponOffsetY"),
                  imageCropX: requireElement("val-imageCropX"),
                  imageCropY: requireElement("val-imageCropY"),
                  imageCropWidth: requireElement("val-imageCropWidth"),
                  imageCropHeight: requireElement("val-imageCropHeight"),
            };

            this.images = {
                  body: new Image(),
                  weaponIdle: new Image(),
                  weaponAttack: new Image(),
            };

            this._init();
      }

      _init() {
            this.configs.forEach((cfg, index) => {
                  const option = document.createElement("option");
                  option.value = String(index);
                  option.textContent = cfg.name;
                  this.select.appendChild(option);
            });

            this.select.addEventListener("change", () => {
                  this.activeConfigIndex = Number.parseInt(
                        this.select.value,
                        10,
                  );
                  this._loadCurrentConfig();
            });

            this.poseSelect.addEventListener("change", () => {
                  this.activePoseKey = this.poseSelect.value;
                  this._onPoseChanged();
            });

            this.resetPoseBtn.addEventListener("click", () =>
                  this._resetCurrentPose(),
            );
            this.imageOutput.addEventListener("change", () =>
                  this._applyImageOutput(),
            );
            this.imageOutput.addEventListener("keydown", (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  this._applyImageOutput();
                  this.imageOutput.select();
            });
            this.imageOutput.addEventListener("paste", () => {
                  setTimeout(() => this._applyImageOutput(), 0);
            });

            this.hitboxType.addEventListener("change", () => {
                  if (this.isRestoring) return;
                  this._updateConfigFromInputs();
                  this._syncHitboxControlState();
                  this._draw();
                  this._saveState();
            });

            (Object.keys(this.controls) as ControlName[]).forEach((key) => {
                  this.controls[key].addEventListener("input", () => {
                        if (this.isRestoring) return;
                        this._updateConfigFromInputs();
                        this._draw();
                  });

                  this.controls[key].addEventListener("change", () => {
                        if (this.isRestoring) return;
                        this._saveState();
                  });
            });

            window.addEventListener("keydown", (event) => {
                  if (!(event.ctrlKey || event.metaKey)) return;

                  if (event.key === "z" && !event.shiftKey) {
                        event.preventDefault();
                        this.undo();
                  } else if (
                        event.key === "y" ||
                        (event.key === "Z" && event.shiftKey)
                  ) {
                        event.preventDefault();
                        this.redo();
                  }
            });

            this.defaultFacingSelect.addEventListener("change", () => {
                  const config = this._currentConfig();
                  config.defaultFacing = this.defaultFacingSelect
                        .value as Facing;
                  this._draw();
                  this._saveState();
            });

            this.saveBtn.addEventListener("click", async () => {
                  const config = this._currentConfig();
                  if (!this.fileHandles.has(config.id)) {
                        // The File System Access API is not available in every browser or
                        // when this page is opened directly from file://. Fall back to a
                        // regular download so Save still has a useful result in those cases.
                        if (typeof window.showSaveFilePicker !== "function") {
                              this._downloadLocalFile(config);
                              return;
                        }

                        try {
                              const fileHandle =
                                    await window.showSaveFilePicker({
                                          suggestedName: `${config.id}.json`,
                                          types: [
                                                {
                                                      description: "JSON Files",
                                                      accept: {
                                                            "application/json":
                                                                  [".json"],
                                                      },
                                                },
                                          ],
                                    });
                              this.fileHandles.set(config.id, fileHandle);
                              this._updateSaveButton();
                        } catch (error: unknown) {
                              // Closing the picker is an intentional cancellation, not a save
                              // failure. Other picker errors can still use the download fallback
                              // (for example, browsers that expose but do not implement it).
                              if (
                                    !(
                                          error instanceof DOMException &&
                                          error.name === "AbortError"
                                    )
                              ) {
                                    console.warn(
                                          "File picker unavailable; downloading instead:",
                                          error,
                                    );
                                    this._downloadLocalFile(config);
                              }
                              return;
                        }
                  }

                  this._saveToLocalFile();
            });

            this.cropBtn.addEventListener("click", () => _enterCropMode(this));
            this.applyCropBtn.addEventListener("click", () => _applyCrop(this));
            this.cancelCropBtn.addEventListener("click", () =>
                  _cancelCrop(this),
            );
            this.editHitboxBtn.addEventListener("click", () =>
                  this._enterHitboxMode(),
            );
            this.applyHitboxBtn.addEventListener("click", () =>
                  this._applyHitbox(),
            );
            this.cancelHitboxBtn.addEventListener("click", () =>
                  this._cancelHitbox(),
            );

            installCanvasToolController(this);
            this.hitboxOutput.addEventListener("change", () =>
                  this._applyHitboxOutput(),
            );

            this.images.weaponIdle.onload = () => this._draw();
            this.images.weaponAttack.onload = () => this._draw();

            this._loadCurrentConfig();
      }

      _currentConfig(): StudioConfig {
            return this.configs[this.activeConfigIndex];
      }

      // ── Pose helpers ──────────────────────────────────────────────────

      /**
       * Return the raw value stored in config.poses[poseKey].
       * Returns undefined when the key does not exist.
       */
      _getPoseConfig(
            config: StudioConfig,
            poseKey: string,
      ): PoseConfig | null | undefined {
            if (poseKey === "base") return null;
            return config.poses?.[poseKey];
      }

      /** Return the image path for a given pose key. */
      _getPoseImagePath(config: StudioConfig, poseKey: string): string {
            if (poseKey === "base") return config.image ?? "";
            const poseVal = config.poses?.[poseKey];
            if (!poseVal) return config.image ?? "";
            if (typeof poseVal === "string") return poseVal;
            return poseVal.image ?? config.image ?? "";
      }

      /**
       * Return the visual overrides (imageScale, imageOffset, imageCrop) for a pose,
       * falling back to top-level config values when the pose doesn't override them.
       */
      _getPoseVisual(config: StudioConfig, poseKey: string): PoseVisual {
            if (poseKey === "base") {
                  return {
                        imageScale: config.imageScale ?? 1,
                        imageOffset: config.imageOffset ?? { x: 0, y: 0 },
                        imageCrop: config.imageCrop ?? null,
                  };
            }
            const poseVal = config.poses?.[poseKey];
            const poseObj: Partial<Exclude<PoseConfig, string>> =
                  poseVal && typeof poseVal === "object" ? poseVal : {};
            return {
                  imageScale: poseObj.imageScale ?? config.imageScale ?? 1,
                  imageOffset: poseObj.imageOffset ??
                        config.imageOffset ?? { x: 0, y: 0 },
                  imageCrop: poseObj.imageCrop ?? config.imageCrop ?? null,
            };
      }

      /**
       * Patch visual fields onto a non-base pose object.
       * If the pose was a string, upgrades it to an object first.
       */
      _setPoseVisual(
            config: StudioConfig,
            poseKey: string,
            patch: PosePatch,
      ): void {
            if (poseKey === "base") {
                  if (patch.imageScale !== undefined)
                        config.imageScale = patch.imageScale;
                  if (patch.imageOffset !== undefined)
                        config.imageOffset = { ...patch.imageOffset };
                  if ("imageCrop" in patch)
                        config.imageCrop = patch.imageCrop
                              ? { ...patch.imageCrop }
                              : null;
                  return;
            }
            config.poses ??= {};
            const existing = config.poses[poseKey];
            const poseObj: Exclude<PoseConfig, string> =
                  existing && typeof existing === "object"
                        ? existing
                        : {
                                image:
                                      typeof existing === "string"
                                            ? existing
                                            : this._getPoseImagePath(
                                                    config,
                                                    poseKey,
                                              ),
                          };
            if (patch.imageScale !== undefined)
                  poseObj.imageScale = patch.imageScale;
            if (patch.imageOffset !== undefined)
                  poseObj.imageOffset = { ...patch.imageOffset };
            if ("imageCrop" in patch)
                  poseObj.imageCrop = patch.imageCrop
                        ? { ...patch.imageCrop }
                        : null;
            config.poses[poseKey] = poseObj;
      }

      /** Populate the pose <select> from base + config.poses keys. */
      _populatePoseSelect(config: StudioConfig): void {
            if (!this.poseSelect) return;
            this.poseSelect.innerHTML = "";
            const addOpt = (value: string, label: string) => {
                  const opt = document.createElement("option");
                  opt.value = value;
                  opt.textContent = label;
                  this.poseSelect.appendChild(opt);
            };
            addOpt("base", "Base");
            const poses = config.poses ?? {};
            for (const key of Object.keys(poses)) {
                  addOpt(key, key);
            }
            // Keep or reset activePoseKey to something valid
            const validKeys = ["base", ...Object.keys(poses)];
            if (!validKeys.includes(this.activePoseKey)) {
                  this.activePoseKey = "base";
            }
            this.poseSelect.value = this.activePoseKey;
            this._updatePoseActionButtons();
      }

      _updatePoseActionButtons() {
            if (!this.resetPoseBtn) return;
            const isBase = this.activePoseKey === "base";
            this.resetPoseBtn.disabled = isBase;
      }

      /** Called when the pose selector changes. Load new image and sync controls. */
      _onPoseChanged() {
            this._updatePoseActionButtons();
            const config = this._currentConfig();
            const imagePath = this._getPoseImagePath(
                  config,
                  this.activePoseKey,
            );
            _loadBodyImage(this, imagePath, this.activePoseKey);
      }

      /** Remove pose-specific visual overrides so it falls back to base. */
      _resetCurrentPose() {
            if (this.activePoseKey === "base") return;
            const config = this._currentConfig();
            const poseVal = config.poses?.[this.activePoseKey];
            if (poseVal && typeof poseVal === "object") {
                  // Keep only the image path, strip visual overrides
                  const imagePath =
                        poseVal.image ??
                        this._getPoseImagePath(config, this.activePoseKey);
                  (config.poses ??= {})[this.activePoseKey] = imagePath;
            }
            this._syncImageControls();
            this._refreshLabels();
            this._saveState();
            this._draw();
      }

      /** Sync image tab controls from the currently active pose. */
      _syncImageControls() {
            const config = this._currentConfig();
            const visual = this._getPoseVisual(config, this.activePoseKey);
            this.controls.imageScale.value = visual.imageScale;
            this.controls.imageOffsetX.value = visual.imageOffset.x;
            this.controls.imageOffsetY.value = visual.imageOffset.y;
            if (visual.imageCrop) {
                  _syncCropControls(this, { imageCrop: visual.imageCrop });
            }
      }

      // ── End pose helpers ──────────────────────────────────────────────

      _ensureConfigShape(config: StudioConfig): void {
            config.imageScale ??= this.defaults?.presentation.imageScale ?? 1;
            config.imageOffset ??= structuredClone(
                  this.defaults?.presentation.imageOffset ?? { x: 0, y: 0 },
            );
            config.imageCrop ??= this.defaults?.presentation.imageCrop ?? null;
            config.healthBarOffset ??= structuredClone(
                  this.defaults?.presentation.healthBarOffset ?? {
                        x: 0,
                        y: -76,
                  },
            );
            config.hitboxOffset ??= structuredClone(
                  this.defaults?.body.hitboxOffset ?? { x: 0, y: -15 },
            );
            config.weaponScale ??= this.defaults?.presentation.weaponScale ?? 1;
            config.weaponOffset ??= structuredClone(
                  this.defaults?.presentation.weaponOffset ?? { x: 0, y: 0 },
            );
            config.defaultFacing ??=
                  this.defaults?.presentation.defaultFacing ?? "right";
            config.hitbox ??= structuredClone(
                  this.defaults?.body.hitbox ?? {
                        type: "box",
                        width: 78,
                        height: 112,
                  },
            );

            if (config.hitbox.type === "box") {
                  config.hitbox.width ??=
                        this.defaults?.body.hitbox.type === "box"
                              ? this.defaults.body.hitbox.width
                              : 78;
                  config.hitbox.height ??=
                        this.defaults?.body.hitbox.type === "box"
                              ? this.defaults.body.hitbox.height
                              : 112;
            } else {
                  config.hitbox.type = "circle";
                  config.hitbox.radius ??=
                        config.radius ?? this.defaults?.body.radius ?? 30;
            }
      }

      _enterCropMode(): void {
            _enterCropMode(this);
      }

      _applyCrop(): void {
            _applyCrop(this);
      }

      _cancelCrop(): void {
            _cancelCrop(this);
      }

      _updateHitboxButtons() {
            updateHitboxButtons(this);
      }

      _enterHitboxMode() {
            enterHitboxMode(this);
      }

      _applyHitbox() {
            applyHitbox(this);
      }

      _cancelHitbox() {
            cancelHitbox(this);
      }

      _getHitboxRect(config: Pick<StudioConfig, "hitbox" | "hitboxOffset">) {
            return getHitboxRect(this, config);
      }

      _getSafetyRect(config: StudioConfig) {
            return getSafetyRect(this, config);
      }
      _clampHitboxOffset(config: StudioConfig, offset: Vector2) {
            return clampHitboxOffset(this, config, offset);
      }
      _syncHitboxControls(config: StudioConfig): void {
            syncHitboxControls(this, config);
      }
      _syncHitboxOffsetControls(offset: Vector2): void {
            syncHitboxOffsetControls(this, offset);
      }

      _loadCurrentConfig() {
            this.mode = "default";
            this.dragState = null;
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.hitboxDraftOffset = null;
            // Reset pose selector to base when switching characters
            this.activePoseKey = "base";
            const config = this._currentConfig();
            this._ensureConfigShape(config);
            this._updateSaveButton();

            this._populatePoseSelect(config);

            this.hitboxType.value = config.hitbox.type;
            this.controls.hitboxWidth.value =
                  config.hitbox.type === "box" ? config.hitbox.width : 44;
            this.controls.hitboxHeight.value =
                  config.hitbox.type === "box" ? config.hitbox.height : 88;
            this.controls.hitboxRadius.value =
                  config.hitbox.type === "circle"
                        ? config.hitbox.radius
                        : (config.radius ?? 30);
            this._syncHitboxOffsetControls(config.hitboxOffset);
            this.defaultFacingSelect.value = config.defaultFacing ?? "right";
            this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
            this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
            this.controls.weaponScale.value = config.weaponScale;
            this.controls.weaponOffsetX.value = config.weaponOffset.x;
            this.controls.weaponOffsetY.value = config.weaponOffset.y;

            // Load base image (activePoseKey == "base" at this point)
            const imagePath = this._getPoseImagePath(config, "base");
            _loadBodyImage(this, imagePath, "base");
            this.images.weaponIdle.src = "../../" + (config.weaponIdle || "");
            this.images.weaponAttack.src =
                  "../../" + (config.weaponAttack || "");

            this._syncImageControls();
            this._syncHitboxControlState();
            this._refreshLabels();
            _updateCropButtons(this);
            this._updateHitboxButtons();
            this._draw();

            this.history = [];
            this.historyIndex = -1;
            this._saveState();
      }

      _syncHitboxControlState() {
            syncHitboxControlState(this);
      }

      _refreshLabels(): void {
            (Object.keys(this.labels) as ControlName[]).forEach((key) => {
                  this.labels[key].textContent = String(
                        this.controls[key].value,
                  );
            });
            this._refreshHitboxOutput();
            this._refreshImageOutput();
      }

      _refreshHitboxOutput() {
            refreshHitboxOutput(this);
      }

      _refreshImageOutput() {
            if (!this.imageOutput) return;
            const config = this._currentConfig();
            const visual = this._getPoseVisual(config, this.activePoseKey);
            const s = visual.imageScale ?? 1;
            const ox = visual.imageOffset?.x ?? 0;
            const oy = visual.imageOffset?.y ?? 0;
            const crop = visual.imageCrop;
            if (crop) {
                  this.imageOutput.value = `${s} ${ox} ${oy} ${crop.x} ${crop.y} ${crop.width} ${crop.height}`;
            } else {
                  this.imageOutput.value = `${s} ${ox} ${oy}`;
            }
      }

      _applyImageOutput() {
            const config = this._currentConfig();
            const numbers =
                  this.imageOutput.value.match(/-?\d+(\.\d+)?/g)?.map(Number) ??
                  [];
            if (numbers.length < 1) {
                  this._refreshImageOutput();
                  return;
            }

            const patch: PosePatch = {};
            if (numbers.length >= 1)
                  patch.imageScale = Math.max(0.1, numbers[0]);
            if (numbers.length >= 3)
                  patch.imageOffset = { x: numbers[1], y: numbers[2] };
            if (numbers.length >= 7) {
                  patch.imageCrop = {
                        x: Math.round(numbers[3]),
                        y: Math.round(numbers[4]),
                        width: Math.max(1, Math.round(numbers[5])),
                        height: Math.max(1, Math.round(numbers[6])),
                  };
            }

            this._setPoseVisual(config, this.activePoseKey, patch);
            if ("imageCrop" in patch) {
                  _clampCrop(this);
            }
            this._syncImageControls();
            this._saveState();
            this._draw();
            this._syncImageControls();
            this._refreshLabels();
      }

      _applyHitboxOutput() {
            applyHitboxOutput(this);
      }
      _snapshotCurrentState(): string {
            return snapshotStudioState(
                  this._currentConfig(),
                  this.activePoseKey,
            );
      }

      _saveState(): void {
            const next = appendHistory(
                  this.history,
                  this.historyIndex,
                  this._snapshotCurrentState(),
            );
            this.history = next.history;
            this.historyIndex = next.historyIndex;
            void this._saveToLocalFile();
      }

      _updateSaveButton() {
            const config = this._currentConfig();
            const isConnected = config && this.fileHandles.has(config.id);
            this.saveBtn.textContent = isConnected
                  ? `Auto-Saving ${config.id}.json`
                  : `Save ${config?.id ?? "Fighter"} File`;
            this.saveBtn.style.background = isConnected ? "#ffffff" : "";
            this.saveBtn.style.color = isConnected ? "#000000" : "";
      }

      _syncFighterDefinition(config: StudioConfig): FighterDefinition {
            return syncFighterDefinition(
                  this.fighterDefinitions,
                  config,
                  this.defaults,
            );
      }

      _cleanForSave(value: JSONValue): JSONValue {
            return cleanForSave(value);
      }

      _getSaveContent(config: StudioConfig): string {
            return getSaveContent(
                  this.fighterDefinitions,
                  config,
                  this.defaults,
            );
      }

      _downloadLocalFile(config: StudioConfig): void {
            downloadFighterFile(this.fighterDefinitions, config, this.defaults);
      }

      async _saveToLocalFile(): Promise<void> {
            await writeFighterFile(
                  this.fighterDefinitions,
                  this._currentConfig(),
                  this.fileHandles.get(this._currentConfig().id),
                  this.defaults,
            );
      }

      undo() {
            if (this.historyIndex <= 0) return;
            this.historyIndex -= 1;
            this._restoreState(this.history[this.historyIndex]);
            this._saveToLocalFile();
      }

      redo() {
            if (this.historyIndex >= this.history.length - 1) return;
            this.historyIndex += 1;
            this._restoreState(this.history[this.historyIndex]);
            void this._saveToLocalFile();
      }

      _restoreState(stateString: string): void {
            this.isRestoring = true;
            const state = JSON.parse(stateString) as StudioState;
            const config = this._currentConfig();

            config.hitbox = { ...state.hitbox };
            config.hitboxOffset = {
                  ...(state.hitboxOffset ??
                        config.hitboxOffset ?? { x: 0, y: 0 }),
            };
            config.defaultFacing = state.defaultFacing ?? "right";
            if (this.defaultFacingSelect)
                  this.defaultFacingSelect.value = config.defaultFacing;
            config.imageScale = state.imageScale;
            config.imageOffset = { ...state.imageOffset };
            config.imageCrop = state.imageCrop ? { ...state.imageCrop } : null;
            config.healthBarOffset = { ...state.healthBarOffset };
            config.weaponScale = state.weaponScale;
            config.weaponOffset = { ...state.weaponOffset };

            // Restore poses with deep copies
            if (state.poses) {
                  const restoredPoses: Record<string, PoseConfig> = {};
                  for (const [k, v] of Object.entries(state.poses)) {
                        restoredPoses[k] =
                              typeof v === "string"
                                    ? v
                                    : JSON.parse(JSON.stringify(v));
                  }
                  config.poses = restoredPoses;
            }
            if (state.activePoseKey !== undefined) {
                  this.activePoseKey = state.activePoseKey;
            }
            this._populatePoseSelect(config);

            this.hitboxType.value = config.hitbox.type;
            this.controls.hitboxWidth.value =
                  config.hitbox.type === "box" ? config.hitbox.width : 44;
            this.controls.hitboxHeight.value =
                  config.hitbox.type === "box" ? config.hitbox.height : 88;
            this.controls.hitboxRadius.value =
                  config.hitbox.type === "circle"
                        ? config.hitbox.radius
                        : (config.radius ?? 30);
            this._syncHitboxOffsetControls(config.hitboxOffset);
            this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
            this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
            this.controls.weaponScale.value = config.weaponScale;
            this.controls.weaponOffsetX.value = config.weaponOffset.x;
            this.controls.weaponOffsetY.value = config.weaponOffset.y;

            // Update body image if pose changed
            const imagePath = this._getPoseImagePath(
                  config,
                  this.activePoseKey,
            );
            const newSrc = "../../" + imagePath;
            if (this.images.body.src !== newSrc) {
                  _loadBodyImage(this, imagePath, this.activePoseKey);
            }

            this._syncImageControls();
            _updateCropRanges(this);
            const visual = this._getPoseVisual(config, this.activePoseKey);
            _syncCropControls(this, { imageCrop: visual.imageCrop });

            this._syncHitboxControlState();
            this._refreshLabels();
            _updateCropButtons(this);
            this._updateHitboxButtons();
            this.isRestoring = false;
      }

      _updateConfigFromInputs() {
            const config = this._currentConfig();
            const hitboxType = this.hitboxType.value;

            const nextHitbox: Hitbox =
                  hitboxType === "box"
                        ? {
                                type: "box",
                                width: Math.round(
                                      numberValue(this.controls.hitboxWidth),
                                ),
                                height: Math.round(
                                      numberValue(this.controls.hitboxHeight),
                                ),
                          }
                        : {
                                type: "circle",
                                radius: Math.round(
                                      numberValue(this.controls.hitboxRadius),
                                ),
                          };
            const currentHitboxOffset =
                  this.mode === "hitbox" && this.hitboxDraftOffset
                        ? this.hitboxDraftOffset
                        : (config.hitboxOffset ?? { x: 0, y: 0 });
            const hitboxOffsetX = numberValue(this.controls.hitboxOffsetX);
            const hitboxOffsetY = numberValue(this.controls.hitboxOffsetY);
            const nextHitboxOffset = clampHitboxOffset(this, config, {
                  x: Number.isFinite(hitboxOffsetX)
                        ? hitboxOffsetX
                        : currentHitboxOffset.x,
                  y: Number.isFinite(hitboxOffsetY)
                        ? hitboxOffsetY
                        : currentHitboxOffset.y,
            });

            updateHitboxFromInputs(this, nextHitbox, nextHitboxOffset);

            // Image scale / offset: pose-aware
            const newScale = numberValue(this.controls.imageScale);
            const newOffset = {
                  x: Math.round(numberValue(this.controls.imageOffsetX)),
                  y: Math.round(numberValue(this.controls.imageOffsetY)),
            };
            this._setPoseVisual(config, this.activePoseKey, {
                  imageScale: newScale,
                  imageOffset: newOffset,
            });

            config.healthBarOffset = {
                  x: Math.round(numberValue(this.controls.healthBarOffsetX)),
                  y: Math.round(numberValue(this.controls.healthBarOffsetY)),
            };
            config.weaponScale = numberValue(this.controls.weaponScale);
            config.weaponOffset = {
                  x: Math.round(numberValue(this.controls.weaponOffsetX)),
                  y: Math.round(numberValue(this.controls.weaponOffsetY)),
            };

            // Crop: pose-aware
            const visual = this._getPoseVisual(config, this.activePoseKey);
            if (visual.imageCrop) {
                  const newCrop = {
                        x: Math.round(numberValue(this.controls.imageCropX)),
                        y: Math.round(numberValue(this.controls.imageCropY)),
                        width: Math.round(
                              numberValue(this.controls.imageCropWidth),
                        ),
                        height: Math.round(
                              numberValue(this.controls.imageCropHeight),
                        ),
                  };
                  this._setPoseVisual(config, this.activePoseKey, {
                        imageCrop: newCrop,
                  });
                  _clampCrop(this);
                  const updatedVisual = this._getPoseVisual(
                        config,
                        this.activePoseKey,
                  );
                  _syncCropControls(this, {
                        imageCrop: updatedVisual.imageCrop,
                  });
            }

            this._refreshLabels();
      }

      _draw(): void {
            drawStudio(this);
      }
}
