// The studio has a large, canvas-focused interaction surface. Keeping its
// implementation intact here makes this a behaviour-preserving module migration.
import { loadFighterConfig } from "../../src/config/fighter-loader";
import { loadRuntimeConfig } from "../../src/config/runtime-config";
import type { IndicatorConfig } from "../../src/types/game";
import type { Facing, FighterConfig, FighterDefinition, Hitbox, ImageCrop, PoseConfig, Vector2 } from "../../src/types/fighter";

type Rect = { x: number; y: number; width: number; height: number };
type NumericInput = Omit<HTMLInputElement, "value"> & { value: string | number };
type PoseVisual = { imageScale: number; imageOffset: Vector2; imageCrop: ImageCrop | null };
type PosePatch = Partial<PoseVisual>;
type ControlName = "hitboxWidth" | "hitboxHeight" | "hitboxRadius" | "hitboxOffsetX" | "hitboxOffsetY" | "imageScale" | "imageOffsetX" | "imageOffsetY" | "healthBarOffsetX" | "healthBarOffsetY" | "weaponScale" | "weaponOffsetX" | "weaponOffsetY" | "imageCropX" | "imageCropY" | "imageCropWidth" | "imageCropHeight";
type EditableHitbox = Hitbox;
type StudioConfig = Omit<FighterConfig, "hitbox" | "poses"> & { hitbox: Hitbox; poses: Record<string, PoseConfig> | null };
type StudioState = Pick<StudioConfig, "hitbox" | "hitboxOffset" | "defaultFacing" | "imageScale" | "imageOffset" | "imageCrop" | "healthBarOffset" | "weaponScale" | "weaponOffset" | "poses"> & { activePoseKey: string };
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
const numberValue = (input: NumericInput): number => Number.parseFloat(String(input.value));
type DragState = { handle: string; startX: number; startY: number; startRect: Rect; imageRect: Rect; startOffset: Vector2 };
type StudioFileHandle = { createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void> }> };
type StudioTextStyle = { fillColor: string; strokeColor: string; strokeWidth: number; weight: string; family: string; align: CanvasTextAlign; baseline: CanvasTextBaseline };
declare global {
  interface Window { showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<StudioFileHandle>; __studioInstance?: CharacterStudio; }
}
const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required studio element: #${id}`);
  return element as T;
};

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
  images: { body: HTMLImageElement; weaponIdle: HTMLImageElement; weaponAttack: HTMLImageElement };
  constructor(
    configs: FighterConfig[],
    private readonly fighterDefinitions: FighterDefinition[],
    private readonly indicatorConfig: IndicatorConfig,
  ) {
    this.canvas = requireElement<HTMLCanvasElement>("studio-canvas");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Unable to create Character Studio canvas context");
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
    this.defaultFacingSelect = requireElement<HTMLSelectElement>("defaultFacing");
    this.resetPoseBtn = requireElement<HTMLButtonElement>("reset-pose-btn");
    this.imageOutput = requireElement<HTMLInputElement>("image-output");
    this.hitboxType = requireElement<HTMLSelectElement>("hitboxType");
    this.editHitboxBtn = requireElement<HTMLButtonElement>("edit-hitbox-btn");
    this.applyHitboxBtn = requireElement<HTMLButtonElement>("apply-hitbox-btn");
    this.cancelHitboxBtn = requireElement<HTMLButtonElement>("cancel-hitbox-btn");
    this.cropBtn = requireElement<HTMLButtonElement>("crop-btn");
    this.applyCropBtn = requireElement<HTMLButtonElement>("apply-crop-btn");
    this.cancelCropBtn = requireElement<HTMLButtonElement>("cancel-crop-btn");
    this.saveBtn = requireElement<HTMLButtonElement>("save-config-btn");
    this.hitboxOutput = requireElement<HTMLInputElement>("hitbox-output");

    this.controls = {
      hitboxWidth: requireElement<NumericInput>("hitboxWidth"), hitboxHeight: requireElement<NumericInput>("hitboxHeight"), hitboxRadius: requireElement<NumericInput>("hitboxRadius"), hitboxOffsetX: requireElement<NumericInput>("hitboxOffsetX"), hitboxOffsetY: requireElement<NumericInput>("hitboxOffsetY"), imageScale: requireElement<NumericInput>("imageScale"), imageOffsetX: requireElement<NumericInput>("imageOffsetX"), imageOffsetY: requireElement<NumericInput>("imageOffsetY"), healthBarOffsetX: requireElement<NumericInput>("healthBarOffsetX"), healthBarOffsetY: requireElement<NumericInput>("healthBarOffsetY"), weaponScale: requireElement<NumericInput>("weaponScale"), weaponOffsetX: requireElement<NumericInput>("weaponOffsetX"), weaponOffsetY: requireElement<NumericInput>("weaponOffsetY"), imageCropX: requireElement<NumericInput>("imageCropX"), imageCropY: requireElement<NumericInput>("imageCropY"), imageCropWidth: requireElement<NumericInput>("imageCropWidth"), imageCropHeight: requireElement<NumericInput>("imageCropHeight"),
    };

    this.labels = {
      hitboxWidth: requireElement("val-hitboxWidth"),
      hitboxHeight: requireElement("val-hitboxHeight"),
      hitboxRadius: requireElement("val-hitboxRadius"), hitboxOffsetX: requireElement("val-hitboxOffsetX"), hitboxOffsetY: requireElement("val-hitboxOffsetY"), imageScale: requireElement("val-imageScale"), imageOffsetX: requireElement("val-imageOffsetX"), imageOffsetY: requireElement("val-imageOffsetY"), healthBarOffsetX: requireElement("val-healthBarOffsetX"), healthBarOffsetY: requireElement("val-healthBarOffsetY"), weaponScale: requireElement("val-weaponScale"), weaponOffsetX: requireElement("val-weaponOffsetX"), weaponOffsetY: requireElement("val-weaponOffsetY"), imageCropX: requireElement("val-imageCropX"), imageCropY: requireElement("val-imageCropY"), imageCropWidth: requireElement("val-imageCropWidth"), imageCropHeight: requireElement("val-imageCropHeight"),
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
      this.activeConfigIndex = Number.parseInt(this.select.value, 10);
      this._loadCurrentConfig();
    });

    this.poseSelect.addEventListener("change", () => {
      this.activePoseKey = this.poseSelect.value;
      this._onPoseChanged();
    });

    this.resetPoseBtn.addEventListener("click", () => this._resetCurrentPose());
    this.imageOutput.addEventListener("change", () => this._applyImageOutput());
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
      } else if (event.key === "y" || (event.key === "Z" && event.shiftKey)) {
        event.preventDefault();
        this.redo();
      }
    });

    this.defaultFacingSelect.addEventListener("change", () => {
      const config = this._currentConfig();
      config.defaultFacing = this.defaultFacingSelect.value as Facing;
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
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: `${config.id}.json`,
            types: [
              {
                description: "JSON Files",
                accept: { "application/json": [".json"] },
              },
            ],
          });
          this.fileHandles.set(config.id, fileHandle);
          this._updateSaveButton();
        } catch (error: unknown) {
          // Closing the picker is an intentional cancellation, not a save
          // failure. Other picker errors can still use the download fallback
          // (for example, browsers that expose but do not implement it).
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.warn("File picker unavailable; downloading instead:", error);
            this._downloadLocalFile(config);
          }
          return;
        }
      }

      this._saveToLocalFile();
    });

    this.cropBtn.addEventListener("click", () => this._enterCropMode());
    this.applyCropBtn.addEventListener("click", () => this._applyCrop());
    this.cancelCropBtn.addEventListener("click", () => this._cancelCrop());
    this.editHitboxBtn.addEventListener("click", () => this._enterHitboxMode());
    this.applyHitboxBtn.addEventListener("click", () => this._applyHitbox());
    this.cancelHitboxBtn.addEventListener("click", () => this._cancelHitbox());

    this.canvas.addEventListener("pointerdown", (event) => this._onCanvasPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this._onCanvasPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this._onCanvasPointerUp(event));
    this.canvas.addEventListener("pointerleave", (event) => this._onCanvasPointerUp(event));
    this.hitboxOutput.addEventListener("change", () => this._applyHitboxOutput());

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
  _getPoseConfig(config: StudioConfig, poseKey: string): PoseConfig | null | undefined {
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
    const poseObj: Partial<Exclude<PoseConfig, string>> = (poseVal && typeof poseVal === "object") ? poseVal : {};
    return {
      imageScale: poseObj.imageScale ?? config.imageScale ?? 1,
      imageOffset: poseObj.imageOffset ?? config.imageOffset ?? { x: 0, y: 0 },
      imageCrop: poseObj.imageCrop ?? config.imageCrop ?? null,
    };
  }

  /**
   * Patch visual fields onto a non-base pose object.
   * If the pose was a string, upgrades it to an object first.
   */
  _setPoseVisual(config: StudioConfig, poseKey: string, patch: PosePatch): void {
    if (poseKey === "base") {
      if (patch.imageScale !== undefined) config.imageScale = patch.imageScale;
      if (patch.imageOffset !== undefined) config.imageOffset = { ...patch.imageOffset };
      if ("imageCrop" in patch) config.imageCrop = patch.imageCrop ? { ...patch.imageCrop } : null;
      return;
    }
    config.poses ??= {};
    const existing = config.poses[poseKey];
    const poseObj: Exclude<PoseConfig, string> = (existing && typeof existing === "object")
      ? existing
      : { image: typeof existing === "string" ? existing : this._getPoseImagePath(config, poseKey) };
    if (patch.imageScale !== undefined) poseObj.imageScale = patch.imageScale;
    if (patch.imageOffset !== undefined) poseObj.imageOffset = { ...patch.imageOffset };
    if ("imageCrop" in patch) poseObj.imageCrop = patch.imageCrop ? { ...patch.imageCrop } : null;
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
    const imagePath = this._getPoseImagePath(config, this.activePoseKey);
    this._loadBodyImage(imagePath, this.activePoseKey);
  }

  /** Remove pose-specific visual overrides so it falls back to base. */
  _resetCurrentPose() {
    if (this.activePoseKey === "base") return;
    const config = this._currentConfig();
    const poseVal = config.poses?.[this.activePoseKey];
    if (poseVal && typeof poseVal === "object") {
      // Keep only the image path, strip visual overrides
      const imagePath = poseVal.image ?? this._getPoseImagePath(config, this.activePoseKey);
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
      this._syncCropControls({ imageCrop: visual.imageCrop });
    }
  }

  // ── End pose helpers ──────────────────────────────────────────────

  _ensureConfigShape(config: StudioConfig): void {
    config.imageScale ??= 1;
    config.imageOffset ??= { x: 0, y: 0 };
    config.imageCrop ??= null;
    config.healthBarOffset ??= { x: 0, y: 0 };
    config.hitboxOffset ??= { x: 0, y: 0 };
    config.weaponScale ??= 1;
    config.weaponOffset ??= { x: 0, y: 0 };
    config.defaultFacing ??= "right";
    config.hitbox ??= { type: "box", width: 44, height: 88 };

    if (config.hitbox.type === "box") {
      config.hitbox.width ??= 44;
      config.hitbox.height ??= 88;
    } else {
      config.hitbox.type = "circle";
      config.hitbox.radius ??= config.radius ?? 30;
    }
  }

  _initCropFromImage(config: StudioConfig): void {
    if (config.imageCrop) return;
    const img = this.images.body;
    if (img.complete && img.naturalWidth > 0) {
      config.imageCrop = { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
    }
  }

  _initPoseCropFromImage(config: StudioConfig, poseKey: string): void {
    if (poseKey === "base") {
      this._initCropFromImage(config);
      return;
    }
    const poseVal = config.poses?.[poseKey];
    const poseObj = (poseVal && typeof poseVal === "object") ? poseVal : null;
    if (poseObj?.imageCrop) return;
    const img = this.images.body;
    if (img.complete && img.naturalWidth > 0) {
      this._setPoseVisual(config, poseKey, {
        imageCrop: { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight },
      });
    }
  }

  _clampCrop() {
    const config = this._currentConfig();
    const img = this.images.body;
    const visual = this._getPoseVisual(config, this.activePoseKey);
    const crop = visual.imageCrop;
    if (!crop) return;
    const nw = img.complete ? img.naturalWidth : Infinity;
    const nh = img.complete ? img.naturalHeight : Infinity;
    const clamped = {
      x: Math.max(0, Math.min(crop.x, nw - 1)),
      y: Math.max(0, Math.min(crop.y, nh - 1)),
      width: Math.max(1, Math.min(crop.width, nw - Math.max(0, Math.min(crop.x, nw - 1)))),
      height: Math.max(1, Math.min(crop.height, nh - Math.max(0, Math.min(crop.y, nh - 1)))),
    };
    // Write clamped crop back
    this._setPoseVisual(config, this.activePoseKey, { imageCrop: clamped });
  }

  _loadBodyImage(imagePath: string, poseKey: string): void {
    const requestToken = ++this.pendingBodyImageRequest;
    const nextSrc = "../../" + imagePath;
    const previousSrc = this.images.body.src;
    this.images.body.onload = () => {
      if (requestToken !== this.pendingBodyImageRequest) return;
      this._onBodyImageLoaded(this._currentConfig(), poseKey);
    };
    this.images.body.src = nextSrc;
    if (previousSrc === nextSrc && this.images.body.complete && this.images.body.naturalWidth > 0) {
      this._onBodyImageLoaded(this._currentConfig(), poseKey);
    }
  }

  _onBodyImageLoaded(config: StudioConfig, poseKey: string): void {
    if (poseKey === "base") {
      this._initCropFromImage(config);
    } else {
      this._initPoseCropFromImage(config, poseKey);
    }
    if (poseKey === this.activePoseKey) {
      this._updateCropRanges();
      this._syncImageControls();
      this._refreshLabels();
      this._draw();
    }
  }

  _updateCropRanges() {
    const img = this.images.body;
    if (!img.complete || img.naturalWidth === 0) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    this.controls.imageCropX.max = String(nw - 1);
    this.controls.imageCropY.max = String(nh - 1);
    this.controls.imageCropWidth.max = String(nw);
    this.controls.imageCropHeight.max = String(nh);
  }

  _getCropDrawRect(image: HTMLImageElement, crop: ImageCrop | null, drawRadius: number): { dx: number; dy: number; dw: number; dh: number; crop: ImageCrop } {
    const fullW = drawRadius * 2;
    const fullH = drawRadius * 2;
    const safeCrop = crop ?? {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };

    return {
      dx: -drawRadius + (safeCrop.x / image.naturalWidth) * fullW,
      dy: -drawRadius + (safeCrop.y / image.naturalHeight) * fullH,
      dw: (safeCrop.width / image.naturalWidth) * fullW,
      dh: (safeCrop.height / image.naturalHeight) * fullH,
      crop: safeCrop,
    };
  }

  _syncCropControls(config: Pick<PoseVisual, "imageCrop">): void {
    // Accept either a config object or a plain {imageCrop} wrapper
    const crop = config.imageCrop;
    if (!crop) return;
    this.controls.imageCropX.value = crop.x;
    this.controls.imageCropY.value = crop.y;
    this.controls.imageCropWidth.value = crop.width;
    this.controls.imageCropHeight.value = crop.height;
  }

  _updateCropButtons() {
    const active = this.mode === "crop";
    this.applyCropBtn.disabled = !active || !this.cropDraft;
    this.cancelCropBtn.disabled = !active;
  }

  _updateHitboxButtons() {
    const active = this.mode === "hitbox";
    this.applyHitboxBtn.disabled = !active || !this.hitboxDraft;
    this.cancelHitboxBtn.disabled = !active;
  }

  _enterCropMode() {
    const config = this._currentConfig();
    this._ensureConfigShape(config);
    if (!this.images.body.complete || this.images.body.naturalWidth === 0) return;

    const visual = this._getPoseVisual(config, this.activePoseKey);
    this.cropDraft = visual.imageCrop
      ? { ...visual.imageCrop }
      : { x: 0, y: 0, width: this.images.body.naturalWidth, height: this.images.body.naturalHeight };
    this.mode = "crop";
    this.dragState = null;
    this._updateCropButtons();
    this._draw();
  }

  _enterHitboxMode() {
    const config = this._currentConfig();
    this._ensureConfigShape(config);
    this.hitboxDraft = { ...config.hitbox };
    this.hitboxDraftOffset = { ...(config.hitboxOffset ?? { x: 0, y: 0 }) };
    this.mode = "hitbox";
    this.dragState = null;
    this._updateHitboxButtons();
    this._draw();
  }

  _applyCrop() {
    if (!this.cropDraft) return;
    const config = this._currentConfig();
    this._setPoseVisual(config, this.activePoseKey, { imageCrop: { ...this.cropDraft } });
    const visual = this._getPoseVisual(config, this.activePoseKey);
    this._syncCropControls({ imageCrop: visual.imageCrop });
    this._refreshLabels();
    this._saveState();
    this.mode = "default";
    this.dragState = null;
    this.cropDraft = null;
    this._updateCropButtons();
    this._draw();
  }

  _cancelCrop() {
    this.mode = "default";
    this.dragState = null;
    this.cropDraft = null;
    this._updateCropButtons();
    this._draw();
  }

  _applyHitbox() {
    if (!this.hitboxDraft) return;
    const config = this._currentConfig();
    config.hitbox = { ...this.hitboxDraft };
    config.hitboxOffset = { ...(this.hitboxDraftOffset ?? { x: 0, y: 0 }) };
    this._syncHitboxControls(config);
    this._refreshLabels();
    this._saveState();
    this.mode = "default";
    this.dragState = null;
    this.hitboxDraft = null;
    this._updateHitboxButtons();
    this._draw();
  }

  _cancelHitbox() {
    this.mode = "default";
    this.dragState = null;
    this.hitboxDraft = null;
    this.hitboxDraftOffset = null;
    this._updateHitboxButtons();
    this._draw();
  }

  _getImageRect(config: StudioConfig): Rect {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = config.radius ?? 30;
    const visual = this._getPoseVisual(config, this.activePoseKey);
    const drawR = radius * visual.imageScale;
    return {
      x: centerX + visual.imageOffset.x - drawR,
      y: centerY + visual.imageOffset.y - drawR,
      width: drawR * 2,
      height: drawR * 2,
    };
  }

  _sourceCropToPreviewRect(imageRect: Rect, crop: ImageCrop, image: HTMLImageElement): Rect {
    return {
      x: imageRect.x + (crop.x / image.naturalWidth) * imageRect.width,
      y: imageRect.y + (crop.y / image.naturalHeight) * imageRect.height,
      width: (crop.width / image.naturalWidth) * imageRect.width,
      height: (crop.height / image.naturalHeight) * imageRect.height,
    };
  }

  _previewRectToSourceCrop(imageRect: Rect, rect: Rect, image: HTMLImageElement): ImageCrop {
    const x = ((rect.x - imageRect.x) / imageRect.width) * image.naturalWidth;
    const y = ((rect.y - imageRect.y) / imageRect.height) * image.naturalHeight;
    const width = (rect.width / imageRect.width) * image.naturalWidth;
    const height = (rect.height / imageRect.height) * image.naturalHeight;
    return this._normalizeCropBounds({ x, y, width, height }, image);
  }

  _normalizeCropBounds(crop: ImageCrop, image: HTMLImageElement): ImageCrop {
    const maxW = image.naturalWidth;
    const maxH = image.naturalHeight;
    const x = Math.max(0, Math.min(crop.x, maxW - 1));
    const y = Math.max(0, Math.min(crop.y, maxH - 1));
    const width = Math.max(1, Math.min(crop.width, maxW - x));
    const height = Math.max(1, Math.min(crop.height, maxH - y));
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  _pointInRect(px: number, py: number, rect: Rect): boolean {
    return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
  }

  _getHitboxRect(config: Pick<StudioConfig, "hitbox" | "hitboxOffset">): Rect {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const offset = config.hitboxOffset ?? { x: 0, y: 0 };
    const hitCenterX = centerX + offset.x;
    const hitCenterY = centerY + offset.y;
    if (config.hitbox.type === "box") {
      return {
        x: hitCenterX - config.hitbox.width / 2,
        y: hitCenterY - config.hitbox.height / 2,
        width: config.hitbox.width,
        height: config.hitbox.height,
      };
    }
    const radius = config.hitbox.radius;
    return {
      x: hitCenterX - radius,
      y: hitCenterY - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  _getSafetyRect(config: StudioConfig): Rect {
    return this._getImageRect(config);
  }

  _clampHitboxOffset(config: StudioConfig, offset: Vector2): Vector2 {
    const safety = this._getSafetyRect(config);
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const maxLeft = centerX - safety.x;
    const maxRight = safety.x + safety.width - centerX;
    const maxTop = centerY - safety.y;
    const maxBottom = safety.y + safety.height - centerY;
    return {
      x: Math.max(-maxLeft, Math.min(offset.x, maxRight)),
      y: Math.max(-maxTop, Math.min(offset.y, maxBottom)),
    };
  }

  _syncHitboxControls(config: StudioConfig): void {
    this.hitboxType.value = config.hitbox.type;
    this.controls.hitboxWidth.value = config.hitbox.type === "box" ? config.hitbox.width : 44;
    this.controls.hitboxHeight.value = config.hitbox.type === "box" ? config.hitbox.height : 88;
    this.controls.hitboxRadius.value = config.hitbox.type === "circle" ? config.hitbox.radius : config.radius ?? 30;
    this._syncHitboxOffsetControls(config.hitboxOffset ?? { x: 0, y: 0 });
    this._syncHitboxControlState();
  }

  _syncHitboxOffsetControls(offset: Vector2): void {
    this.controls.hitboxOffsetX.value = Math.round(offset.x ?? 0);
    this.controls.hitboxOffsetY.value = Math.round(offset.y ?? 0);
  }

  _hitTestRectHandles(px: number, py: number, rect: Rect): string | null {
    const size = 12;
    const half = size / 2;
    const hits: Array<[string, number, number]> = [
      ["nw", rect.x, rect.y], ["n", rect.x + rect.width / 2, rect.y], ["ne", rect.x + rect.width, rect.y],
      ["w", rect.x, rect.y + rect.height / 2], ["e", rect.x + rect.width, rect.y + rect.height / 2],
      ["sw", rect.x, rect.y + rect.height], ["s", rect.x + rect.width / 2, rect.y + rect.height], ["se", rect.x + rect.width, rect.y + rect.height],
    ];
    for (const [name, x, y] of hits) {
      if (Math.abs(px - x) <= half && Math.abs(py - y) <= half) return name;
    }
    return this._pointInRect(px, py, rect) ? "move" : null;
  }

  _hitTestCircleHandle(px: number, py: number, rect: Rect): string | null {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const radius = rect.width / 2;
    const dx = px - cx;
    const dy = py - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(distance - radius) <= 10) return "radius";
    return distance < radius ? "move" : null;
  }

  _hitTestCropHandle(px: number, py: number, rect: Rect): string | null {
    const size = 12;
    const half = size / 2;
    const handles: Array<[string, number, number]> = [
      ["nw", rect.x, rect.y], ["n", rect.x + rect.width / 2, rect.y], ["ne", rect.x + rect.width, rect.y],
      ["w", rect.x, rect.y + rect.height / 2], ["move", rect.x + rect.width / 2, rect.y + rect.height / 2], ["e", rect.x + rect.width, rect.y + rect.height / 2],
      ["sw", rect.x, rect.y + rect.height], ["s", rect.x + rect.width / 2, rect.y + rect.height], ["se", rect.x + rect.width, rect.y + rect.height],
    ];
    for (const [name, x, y] of handles) {
      if (Math.abs(px - x) <= half && Math.abs(py - y) <= half) return name;
    }
    return this._pointInRect(px, py, rect) ? "move" : null;
  }

  _onCanvasPointerDown(event: PointerEvent): void {
    if (this.mode !== "crop" && this.mode !== "hitbox") return;
    const config = this._currentConfig();
    const point = this._getCanvasPoint(event);
    const rect = this.mode === "crop"
      ? this._sourceCropToPreviewRect(this._getImageRect(config), this.cropDraft ?? { x: 0, y: 0, width: this.images.body.naturalWidth, height: this.images.body.naturalHeight }, this.images.body)
      : this._getHitboxRect({ hitbox: this.hitboxDraft ?? config.hitbox, hitboxOffset: this.hitboxDraftOffset ?? config.hitboxOffset });
    const handle = this.mode === "crop"
      ? this._hitTestCropHandle(point.x, point.y, rect)
      : (this.hitboxDraft?.type === "box" ? this._hitTestRectHandles(point.x, point.y, rect) : this._hitTestCircleHandle(point.x, point.y, rect));
    if (!handle) return;

    this.canvas.setPointerCapture(event.pointerId);
    this.dragState = { handle, startX: point.x, startY: point.y, startRect: { ...rect }, imageRect: this._getImageRect(config), startOffset: { ...(this.hitboxDraftOffset ?? config.hitboxOffset ?? { x: 0, y: 0 }) } };
  }

  _onCanvasPointerMove(event: PointerEvent): void {
    if (!this.dragState) return;
    const point = this._getCanvasPoint(event);
    const deltaX = point.x - this.dragState.startX;
    const deltaY = point.y - this.dragState.startY;
    const handle = this.dragState.handle;

    if (this.mode === "crop") {
      const r = { ...this.dragState.startRect };
      if (handle === "move") {
        r.x += deltaX;
        r.y += deltaY;
      } else {
        if (handle.includes("w")) { r.x += deltaX; r.width -= deltaX; }
        if (handle.includes("e")) { r.width += deltaX; }
        if (handle.includes("n")) { r.y += deltaY; r.height -= deltaY; }
        if (handle.includes("s")) { r.height += deltaY; }
      }
      const minSize = 8;
      if (r.width < minSize) { if (handle.includes("w")) r.x -= minSize - r.width; r.width = minSize; }
      if (r.height < minSize) { if (handle.includes("n")) r.y -= minSize - r.height; r.height = minSize; }
      const image = this.images.body;
      const maxX = this.dragState.imageRect.x + this.dragState.imageRect.width;
      const maxY = this.dragState.imageRect.y + this.dragState.imageRect.height;
      r.x = Math.max(this.dragState.imageRect.x, Math.min(r.x, maxX - r.width));
      r.y = Math.max(this.dragState.imageRect.y, Math.min(r.y, maxY - r.height));
      r.width = Math.max(minSize, Math.min(r.width, maxX - r.x));
      r.height = Math.max(minSize, Math.min(r.height, maxY - r.y));

      this.cropDraft = this._previewRectToSourceCrop(this.dragState.imageRect, r, image);
      this._syncCropControls({ imageCrop: this.cropDraft });
    } else if (this.mode === "hitbox") {
      if (this.hitboxDraft?.type === "box") {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offset = this.dragState.startOffset ?? { x: 0, y: 0 };
        let width = this.hitboxDraft.width;
        let height = this.hitboxDraft.height;
        if (handle === "move") {
          this.hitboxDraftOffset = this._clampHitboxOffset(this._currentConfig(), {
            x: offset.x + deltaX,
            y: offset.y + deltaY,
          });
        } else {
          if (handle.includes("e") || handle.includes("w")) {
            width = Math.max(10, Math.abs(point.x - centerX - offset.x) * 2);
          }
          if (handle.includes("n") || handle.includes("s")) {
            height = Math.max(10, Math.abs(point.y - centerY - offset.y) * 2);
          }
          this.hitboxDraftOffset = this._clampHitboxOffset(this._currentConfig(), offset);
        }
        this.hitboxDraft = {
          type: "box",
          width: Math.round(width),
          height: Math.round(height),
        };
        this.controls.hitboxWidth.value = this.hitboxDraft.width;
        this.controls.hitboxHeight.value = this.hitboxDraft.height;
      } else {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offset = this.dragState.startOffset ?? { x: 0, y: 0 };
        let radius = this.hitboxDraft?.type === "circle" ? this.hitboxDraft.radius : 30;
        if (handle === "move") {
          this.hitboxDraftOffset = this._clampHitboxOffset(this._currentConfig(), {
            x: offset.x + deltaX,
            y: offset.y + deltaY,
          });
        } else {
          radius = Math.max(5, Math.round(Math.hypot(point.x - centerX - offset.x, point.y - centerY - offset.y)));
          this.hitboxDraftOffset = this._clampHitboxOffset(this._currentConfig(), offset);
        }
        this.hitboxDraft = { type: "circle", radius };
        this.controls.hitboxRadius.value = radius;
      }
      this._syncHitboxOffsetControls(this.hitboxDraftOffset ?? { x: 0, y: 0 });
      this._refreshLabels();
    }
    this._refreshLabels();
    this._draw();
  }

  _onCanvasPointerUp(event: PointerEvent): void {
    if (this.dragState && this.canvas.hasPointerCapture?.(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.dragState = null;
  }

  _getCanvasPoint(event: PointerEvent): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
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
    this.controls.hitboxWidth.value = config.hitbox.type === "box" ? config.hitbox.width : 44;
    this.controls.hitboxHeight.value = config.hitbox.type === "box" ? config.hitbox.height : 88;
    this.controls.hitboxRadius.value = config.hitbox.type === "circle" ? config.hitbox.radius : config.radius ?? 30;
    this._syncHitboxOffsetControls(config.hitboxOffset);
    this.defaultFacingSelect.value = config.defaultFacing ?? "right";
    this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
    this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
    this.controls.weaponScale.value = config.weaponScale;
    this.controls.weaponOffsetX.value = config.weaponOffset.x;
    this.controls.weaponOffsetY.value = config.weaponOffset.y;

    // Load base image (activePoseKey == "base" at this point)
    const imagePath = this._getPoseImagePath(config, "base");
    this._loadBodyImage(imagePath, "base");
    this.images.weaponIdle.src = "../../" + (config.weaponIdle || "");
    this.images.weaponAttack.src = "../../" + (config.weaponAttack || "");

    this._syncImageControls();
    this._syncHitboxControlState();
    this._refreshLabels();
    this._updateCropButtons();
    this._updateHitboxButtons();
    this._draw();

    this.history = [];
    this.historyIndex = -1;
    this._saveState();
  }

  _syncHitboxControlState() {
    const isBox = this.hitboxType.value === "box";
    this.controls.hitboxWidth.disabled = !isBox;
    this.controls.hitboxHeight.disabled = !isBox;
    this.controls.hitboxRadius.disabled = isBox;
  }

  _refreshLabels(): void {
    (Object.keys(this.labels) as ControlName[]).forEach((key) => {
      this.labels[key].textContent = String(this.controls[key].value);
    });
    this._refreshHitboxOutput();
    this._refreshImageOutput();
  }

  _refreshHitboxOutput() {
    if (!this.hitboxOutput) return;
    const config = this._currentConfig();
    const hitbox = this.mode === "hitbox" && this.hitboxDraft
      ? this.hitboxDraft
      : config.hitbox;
    const offset = this.mode === "hitbox" && this.hitboxDraftOffset
      ? this.hitboxDraftOffset
      : (config.hitboxOffset ?? { x: 0, y: 0 });
    this.hitboxOutput.value = hitbox.type === "box"
      ? `${Math.round(hitbox.width)} ${Math.round(hitbox.height)} ${Math.round(offset.x)} ${Math.round(offset.y)}`
      : `${Math.round(hitbox.radius)} ${Math.round(offset.x)} ${Math.round(offset.y)}`;
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
    const numbers = this.imageOutput.value
      .match(/-?\d+(\.\d+)?/g)
      ?.map(Number) ?? [];
    if (numbers.length < 1) { this._refreshImageOutput(); return; }

    const patch: PosePatch = {};
    if (numbers.length >= 1) patch.imageScale = Math.max(0.1, numbers[0]);
    if (numbers.length >= 3) patch.imageOffset = { x: numbers[1], y: numbers[2] };
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
      this._clampCrop();
    }
    this._syncImageControls();
    this._saveState();
    this._draw();
    this._syncImageControls();
    this._refreshLabels();
  }

  _applyHitboxOutput() {
    const config = this._currentConfig();
    const numbers = this.hitboxOutput.value
      .match(/-?\d+(\.\d+)?/g)
      ?.map(Number) ?? [];
    const target = this.mode === "hitbox" && this.hitboxDraft
      ? this.hitboxDraft
      : config.hitbox;
    const offsetTarget = this.mode === "hitbox"
      ? (this.hitboxDraftOffset ?? { ...(config.hitboxOffset ?? { x: 0, y: 0 }) })
      : { ...(config.hitboxOffset ?? { x: 0, y: 0 }) };

    if (target.type === "box") {
      if (numbers.length < 2) {
        this._refreshHitboxOutput();
        return;
      }

      target.width = Math.max(10, Math.round(numbers[0]));
      target.height = Math.max(10, Math.round(numbers[1]));
      this.controls.hitboxWidth.value = target.width;
      this.controls.hitboxHeight.value = target.height;
      this.controls.hitboxRadius.value = Math.round(Math.max(target.width, target.height) / 2);
      if (numbers.length >= 4) {
        offsetTarget.x = Math.round(numbers[2]);
        offsetTarget.y = Math.round(numbers[3]);
      }
    } else {
      if (numbers.length < 1) {
        this._refreshHitboxOutput();
        return;
      }

      target.radius = Math.max(5, Math.round(numbers[0]));
      this.controls.hitboxRadius.value = target.radius;
      if (numbers.length >= 3) {
        offsetTarget.x = Math.round(numbers[1]);
        offsetTarget.y = Math.round(numbers[2]);
      }
    }

    if (this.mode !== "hitbox") {
      config.hitbox = { ...target };
      config.hitboxOffset = this._clampHitboxOffset(config, offsetTarget);
      this._saveState();
    } else {
      this.hitboxDraftOffset = this._clampHitboxOffset(config, offsetTarget);
    }

    this._syncHitboxOffsetControls(this.mode === "hitbox" ? (this.hitboxDraftOffset ?? { x: 0, y: 0 }) : config.hitboxOffset);
    this._refreshLabels();
    this._draw();
  }

  _snapshotCurrentState(): string {
    const config = this._currentConfig();
    // Deep-clone poses so undo history never shares nested objects
    const posesSnapshot: Record<string, PoseConfig> = {};
    const poses = config.poses ?? {};
    for (const [k, v] of Object.entries(poses)) {
      posesSnapshot[k] = typeof v === "string" ? v : JSON.parse(JSON.stringify(v));
    }
    return JSON.stringify({
      hitbox: { ...config.hitbox },
      hitboxOffset: { ...(config.hitboxOffset ?? { x: 0, y: 0 }) },
      defaultFacing: config.defaultFacing ?? "right",
      imageScale: config.imageScale,
      imageOffset: { ...config.imageOffset },
      imageCrop: config.imageCrop ? { ...config.imageCrop } : null,
      healthBarOffset: { ...config.healthBarOffset },
      weaponScale: config.weaponScale,
      weaponOffset: { ...config.weaponOffset },
      poses: posesSnapshot,
      activePoseKey: this.activePoseKey,
    });
  }

  _saveState() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this._snapshotCurrentState());
    this.historyIndex += 1;
    this._saveToLocalFile();
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
    const definition = this.fighterDefinitions.find((item) => item.id === config.id);
    if (!definition) throw new Error(`Missing fighter definition for ${config.id}`);

    definition.body = definition.body || {};
    definition.body.hitbox = JSON.parse(JSON.stringify(config.hitbox));
    definition.body.hitboxOffset = JSON.parse(JSON.stringify(config.hitboxOffset));

    definition.presentation = definition.presentation || {};
    definition.presentation.image = config.image;
    definition.presentation.imageScale = config.imageScale;
    definition.presentation.imageOffset = JSON.parse(JSON.stringify(config.imageOffset));
    definition.presentation.imageCrop = config.imageCrop
      ? JSON.parse(JSON.stringify(config.imageCrop))
      : null;
    definition.presentation.healthBarOffset = JSON.parse(
      JSON.stringify(config.healthBarOffset),
    );
    definition.presentation.weaponScale = config.weaponScale;
    definition.presentation.weaponOffset = JSON.parse(JSON.stringify(config.weaponOffset));
    definition.presentation.defaultFacing = config.defaultFacing;
    definition.presentation.poses = config.poses
      ? JSON.parse(JSON.stringify(config.poses))
      : null;

    return definition;
  }

  _cleanForSave(value: JSONValue): JSONValue {
    if (typeof value === "number") {
      if (Math.abs(value) < 0.0005) return 0;
      return Math.round(value * 1000) / 1000;
    }
    if (Array.isArray(value)) return value.map((item) => this._cleanForSave(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this._cleanForSave(item)]),
      );
    }
    return value;
  }

  _getSaveContent(config: StudioConfig): string {
    const definition = this._cleanForSave(this._syncFighterDefinition(config) as unknown as JSONValue);
    return `${JSON.stringify(definition, null, 2)}\n`;
  }

  _downloadLocalFile(config: StudioConfig): void {
    try {
      const blob = new Blob([this._getSaveContent(config)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${config.id}.json`;
      link.click();
      // Release the object URL after the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  }

  async _saveToLocalFile() {
    const config = this._currentConfig();
    const fileHandle = this.fileHandles.get(config.id);
    if (!fileHandle) return;

    try {
      const writable = await fileHandle.createWritable();
      await writable.write(this._getSaveContent(config));
      await writable.close();
    } catch (error) {
      console.error("Failed to write to file:", error);
    }
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
    this._saveToLocalFile();
    this._saveToLocalFile();
  }

  _restoreState(stateString: string): void {
    this.isRestoring = true;
    const state = JSON.parse(stateString) as StudioState;
    const config = this._currentConfig();

    config.hitbox = { ...state.hitbox };
    config.hitboxOffset = { ...(state.hitboxOffset ?? config.hitboxOffset ?? { x: 0, y: 0 }) };
    config.defaultFacing = state.defaultFacing ?? "right";
    if (this.defaultFacingSelect) this.defaultFacingSelect.value = config.defaultFacing;
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
        restoredPoses[k] = typeof v === "string" ? v : JSON.parse(JSON.stringify(v));
      }
      config.poses = restoredPoses;
    }
    if (state.activePoseKey !== undefined) {
      this.activePoseKey = state.activePoseKey;
    }
    this._populatePoseSelect(config);

    this.hitboxType.value = config.hitbox.type;
    this.controls.hitboxWidth.value = config.hitbox.type === "box" ? config.hitbox.width : 44;
    this.controls.hitboxHeight.value = config.hitbox.type === "box" ? config.hitbox.height : 88;
    this.controls.hitboxRadius.value = config.hitbox.type === "circle" ? config.hitbox.radius : config.radius ?? 30;
    this._syncHitboxOffsetControls(config.hitboxOffset);
    this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
    this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
    this.controls.weaponScale.value = config.weaponScale;
    this.controls.weaponOffsetX.value = config.weaponOffset.x;
    this.controls.weaponOffsetY.value = config.weaponOffset.y;

    // Update body image if pose changed
    const imagePath = this._getPoseImagePath(config, this.activePoseKey);
    const newSrc = "../../" + imagePath;
    if (this.images.body.src !== newSrc) {
      this._loadBodyImage(imagePath, this.activePoseKey);
    }

    this._syncImageControls();
    this._updateCropRanges();
    const visual = this._getPoseVisual(config, this.activePoseKey);
    this._syncCropControls({ imageCrop: visual.imageCrop });

    this._syncHitboxControlState();
    this._refreshLabels();
    this._updateCropButtons();
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
            width: Math.round(numberValue(this.controls.hitboxWidth)),
            height: Math.round(numberValue(this.controls.hitboxHeight)),
          }
        : {
            type: "circle",
            radius: Math.round(numberValue(this.controls.hitboxRadius)),
          };
    const currentHitboxOffset = this.mode === "hitbox" && this.hitboxDraftOffset
      ? this.hitboxDraftOffset
      : (config.hitboxOffset ?? { x: 0, y: 0 });
    const hitboxOffsetX = numberValue(this.controls.hitboxOffsetX);
    const hitboxOffsetY = numberValue(this.controls.hitboxOffsetY);
    const nextHitboxOffset = this._clampHitboxOffset(config, {
      x: Number.isFinite(hitboxOffsetX) ? hitboxOffsetX : currentHitboxOffset.x,
      y: Number.isFinite(hitboxOffsetY) ? hitboxOffsetY : currentHitboxOffset.y,
    });

    if (this.mode === "hitbox") {
      this.hitboxDraft = nextHitbox;
      this.hitboxDraftOffset = nextHitboxOffset;
    } else {
      config.hitbox = nextHitbox;
      config.hitboxOffset = nextHitboxOffset;
    }
    this._syncHitboxOffsetControls(nextHitboxOffset);

    // Image scale / offset: pose-aware
    const newScale = numberValue(this.controls.imageScale);
    const newOffset = {
      x: Math.round(numberValue(this.controls.imageOffsetX)),
      y: Math.round(numberValue(this.controls.imageOffsetY)),
    };
    this._setPoseVisual(config, this.activePoseKey, { imageScale: newScale, imageOffset: newOffset });

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
        width: Math.round(numberValue(this.controls.imageCropWidth)),
        height: Math.round(numberValue(this.controls.imageCropHeight)),
      };
      this._setPoseVisual(config, this.activePoseKey, { imageCrop: newCrop });
      this._clampCrop();
      const updatedVisual = this._getPoseVisual(config, this.activePoseKey);
      this._syncCropControls({ imageCrop: updatedVisual.imageCrop });
    }

    this._refreshLabels();
  }

  _drawHitboxOutline(config: StudioConfig, centerX: number, centerY: number): void {
    const hitbox = this.mode === "hitbox" && this.hitboxDraft ? this.hitboxDraft : config.hitbox;
    const offset = this.mode === "hitbox" && this.hitboxDraftOffset ? this.hitboxDraftOffset : (config.hitboxOffset ?? { x: 0, y: 0 });
    const hitCenterX = centerX + offset.x;
    const hitCenterY = centerY + offset.y;
    this.ctx.save();
    this.ctx.strokeStyle = this.mode === "hitbox" ? "#ffb000" : "rgba(255, 0, 0, 0.75)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 6]);

    if (hitbox.type === "box") {
      const width = hitbox.width;
      const height = hitbox.height;
      this.ctx.strokeRect(
        hitCenterX - width / 2,
        hitCenterY - height / 2,
        width,
        height,
      );
    } else {
      this.ctx.beginPath();
      this.ctx.arc(hitCenterX, hitCenterY, hitbox.radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  _drawHitboxEditOverlay(config: StudioConfig, centerX: number, centerY: number): void {
    if (this.mode !== "hitbox" || !this.hitboxDraft) return;
    const offset = this.hitboxDraftOffset ?? config.hitboxOffset ?? { x: 0, y: 0 };
    const rect = this._getHitboxRect({ hitbox: this.hitboxDraft, hitboxOffset: offset });
    const cx = centerX + offset.x;
    const cy = centerY + offset.y;
    const safety = this._getSafetyRect(config);
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.rect(safety.x, safety.y, safety.width, safety.height);
    if (this.hitboxDraft.type === "box") {
      this.ctx.rect(rect.x, rect.y, rect.width, rect.height);
    } else {
      this.ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
    }
    this.ctx.fill("evenodd");
    this.ctx.strokeStyle = "rgba(212, 160, 0, 0.35)";
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeRect(safety.x, safety.y, safety.width, safety.height);
    this.ctx.strokeStyle = "#ffb000";
    this.ctx.lineWidth = 2;
    if (this.hitboxDraft.type === "box") {
      this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      const pts = [
        [rect.x, rect.y], [rect.x + rect.width / 2, rect.y], [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height / 2], [rect.x + rect.width, rect.y + rect.height / 2],
        [rect.x, rect.y + rect.height], [rect.x + rect.width / 2, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
      ];
      this.ctx.fillStyle = "#fff";
      for (const [x, y] of pts) this.ctx.fillRect(x - 4, y - 4, 8, 8);
      this.ctx.strokeStyle = "#ffb000";
      for (const [x, y] of pts) this.ctx.strokeRect(x - 4, y - 4, 8, 8);
    } else {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(cx + rect.width / 2, cy, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = "#fff";
      this.ctx.fill();
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  _tracePlusPath(x: number, y: number, size: number): void {
    const unit = size / 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x + unit, y);
    this.ctx.lineTo(x + unit * 2, y);
    this.ctx.lineTo(x + unit * 2, y + unit);
    this.ctx.lineTo(x + size, y + unit);
    this.ctx.lineTo(x + size, y + unit * 2);
    this.ctx.lineTo(x + unit * 2, y + unit * 2);
    this.ctx.lineTo(x + unit * 2, y + size);
    this.ctx.lineTo(x + unit, y + size);
    this.ctx.lineTo(x + unit, y + unit * 2);
    this.ctx.lineTo(x, y + unit * 2);
    this.ctx.lineTo(x, y + unit);
    this.ctx.lineTo(x + unit, y + unit);
    this.ctx.closePath();
  }

  _draw() {
    const ctx = this.ctx;
    const config = this._currentConfig();
    this._ensureConfigShape(config);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = config.radius ?? 30;
    const imageRect = this.images.body.complete && this.images.body.naturalWidth > 0
      ? this._getImageRect(config)
      : null;

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, this.canvas.height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.canvas.width, centerY);
    ctx.stroke();

    this._drawHitboxOutline(config, centerX, centerY);

    if (this.images.body.complete && this.images.body.naturalWidth > 0) {
      this._clampCrop();
      const visual = this._getPoseVisual(config, this.activePoseKey);
      const drawRadius = radius * visual.imageScale;
      const { crop, dx, dy, dw, dh } = this._getCropDrawRect(
        this.images.body,
        visual.imageCrop,
        drawRadius,
      );

      const studioFlip = config.defaultFacing === "left" ? -1 : 1;
      ctx.save();
      ctx.translate(
        centerX + visual.imageOffset.x,
        centerY + visual.imageOffset.y,
      );
      ctx.scale(studioFlip, 1);
      ctx.drawImage(
        this.images.body,
        crop.x, crop.y, crop.width, crop.height,
        dx,
        dy,
        dw,
        dh,
      );
      ctx.restore();

      if (this.mode === "crop" && this.cropDraft && imageRect) {
        const cropRect = this._sourceCropToPreviewRect(imageRect, this.cropDraft, this.images.body);

        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.rect(0, 0, this.canvas.width, this.canvas.height);
        ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        ctx.fill("evenodd");

        ctx.strokeStyle = "#d4a000";
        ctx.lineWidth = 2;
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

        const handleSize = 8;
        const points = [
          [cropRect.x, cropRect.y],
          [cropRect.x + cropRect.width / 2, cropRect.y],
          [cropRect.x + cropRect.width, cropRect.y],
          [cropRect.x, cropRect.y + cropRect.height / 2],
          [cropRect.x + cropRect.width, cropRect.y + cropRect.height / 2],
          [cropRect.x, cropRect.y + cropRect.height],
          [cropRect.x + cropRect.width / 2, cropRect.y + cropRect.height],
          [cropRect.x + cropRect.width, cropRect.y + cropRect.height],
        ];
        ctx.fillStyle = "#fff";
        for (const [x, y] of points) {
          ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
          ctx.strokeStyle = "#d4a000";
          ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        }
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = config.color;
      ctx.fill();
      ctx.restore();
    }

    if (this.mode === "hitbox") {
      this._drawHitboxEditOverlay(config, centerX, centerY);
    }

    if (
      this.images.weaponIdle.complete &&
      this.images.weaponIdle.naturalWidth > 0
    ) {
      const weaponRadius = radius * config.weaponScale;
      ctx.save();
      ctx.translate(
        centerX + config.weaponOffset.x,
        centerY + config.weaponOffset.y,
      );
      ctx.drawImage(
        this.images.weaponIdle,
        -weaponRadius,
        -weaponRadius,
        weaponRadius * 2,
        weaponRadius * 2,
      );
      ctx.restore();
    }

    const plusSize = radius * 2;
    const plusX = centerX - plusSize / 2 + config.healthBarOffset.x;
    const plusY = centerY - radius - 20 + config.healthBarOffset.y;

    ctx.save();
    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.fillStyle = "#222222";
    ctx.fill();

    ctx.save();
    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.clip();
    ctx.fillStyle = "hsl(120, 90%, 40%)";
    ctx.fillRect(plusX, plusY, plusSize, plusSize);
    ctx.restore();

    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    const indicatorCfg = this.indicatorConfig;
    const textCfg = indicatorCfg.text as StudioTextStyle;
    const fontSize = Math.max(
      indicatorCfg.health.minFontSize,
      plusSize * indicatorCfg.health.sizeMultiplier,
    );
    const healthText = String(config.maxHealth ?? 100);
    ctx.fillStyle = textCfg.fillColor;
    ctx.strokeStyle = textCfg.strokeColor;
    ctx.lineWidth = textCfg.strokeWidth;
    ctx.font = `${textCfg.weight} ${fontSize}px ${textCfg.family}`;
    ctx.textAlign = textCfg.align;
    ctx.textBaseline = textCfg.baseline;
    ctx.strokeText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
    ctx.fillText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
    ctx.restore();
  }
}

function installStudioControls(studio: CharacterStudio) {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((tab) => {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-content").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      document.getElementById(`tab-${button.dataset.tab}`)?.classList.add("active");
    });
  });

  const seedNumberInputs = () => {
    document.querySelectorAll<HTMLInputElement>(".num-input").forEach((numberInput) => {
      const slider = document.getElementById(numberInput.dataset.for ?? "") as HTMLInputElement | null;
      if (slider) numberInput.value = slider.value;
    });
  };

  document.querySelectorAll<HTMLInputElement>(".num-input").forEach((numberInput) => {
    const slider = document.getElementById(numberInput.dataset.for ?? "") as HTMLInputElement | null;
    if (!slider) return;
    const syncToSlider = (eventName: "input" | "change") => () => {
      slider.value = numberInput.value;
      slider.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    numberInput.addEventListener("input", syncToSlider("input"));
    numberInput.addEventListener("change", syncToSlider("change"));
    slider.addEventListener("input", () => { numberInput.value = slider.value; });
    slider.addEventListener("change", () => { numberInput.value = slider.value; });
    numberInput.value = slider.value;
  });

  const originalRefresh = studio._refreshLabels.bind(studio);
  studio._refreshLabels = () => {
    originalRefresh();
    seedNumberInputs();
  };

  const badge = document.getElementById("mode-badge");
  const updateBadge = () => {
    if (!badge) return;
    if (studio.mode === "crop") {
      badge.textContent = "✂ CROP MODE";
      badge.className = "mode-badge crop";
    } else if (studio.mode === "hitbox") {
      badge.textContent = "⬛ HITBOX MODE";
      badge.className = "mode-badge hitbox";
    } else {
      badge.className = "mode-badge hidden";
    }
  };

  ( ["_enterCropMode", "_applyCrop", "_cancelCrop", "_enterHitboxMode", "_applyHitbox", "_cancelHitbox", "_loadCurrentConfig"] as const).forEach((methodName) => {
    const original = studio[methodName].bind(studio);
    studio[methodName] = () => {
      const result = original();
      updateBadge();
      return result;
    };
  });

  document.getElementById("undo-btn")?.addEventListener("click", () => studio.undo());
  document.getElementById("redo-btn")?.addEventListener("click", () => studio.redo());
  seedNumberInputs();
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const [fighterConfig, runtimeConfig] = await Promise.all([
      loadFighterConfig("../../config/fighters"),
      loadRuntimeConfig("../../config"),
    ]);
    const studio = new CharacterStudio(
      fighterConfig.roster,
      fighterConfig.definitions,
      runtimeConfig.indicators,
    );
    window.__studioInstance = studio;
    installStudioControls(studio);
  } catch (error) {
    console.error("Failed to start Character Studio:", error);
  }
});
