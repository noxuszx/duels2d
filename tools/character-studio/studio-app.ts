// Coordinates Studio dependencies, selection, and high-level editor actions.
import type { IndicatorConfig } from "../../src/types/game";
import type { AttackHitboxAction } from "../../src/abilities/types";
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
import { AimTool } from "./aim-tool";
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
import { spriteCatalog } from "./sprite-catalog";
import { poseLabel } from "./pose-label";
import { poseBank, TransformationTool, type StudioForm } from "./transformation-tool";
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

const SUPPORTED_POSE_KEYS = [
      "idle",
      "attackWindup",
      "attackActive",
      "recovery",
      "crawl1",
      "crawl2",
] as const;

export class CharacterStudio {
      activeForm: StudioForm = "base";
      transformationTool!: TransformationTool;
      aimTool!: AimTool;

      _poseBank(config = this._currentConfig()): Record<string, PoseConfig> {
            return poseBank(config, this.activeForm);
      }

      _editingAbilities() {
            const config = this._currentConfig();
            return this.activeForm === "transformed" && config.transformation
                  ? config.transformation.abilities : config.abilities;
      }

      _refreshForm(): void {
            this.mode = "default";
            this.dragState = null;
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.hitboxDraftOffset = null;
            this.activePoseKey = this.activeForm === "transformed" ? "idle" : "base";
            this._populatePoseSelect(this._currentConfig());
            this._populateAttackHitboxSelect();
            this._populateProjectileSelect();
            this._syncSwingControls();
            this._syncHitboxControls(this._currentConfig());
            this._updateHitboxButtons();
            _updateCropButtons(this);
            this.transformationTool.sync();
            this._onPoseChanged();
            this._draw();
      }
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
      poseImageSelect: HTMLSelectElement;
      poseImageInput: HTMLInputElement;
      defaultFacingSelect: HTMLSelectElement;
      resetPoseBtn: HTMLButtonElement;
      addPoseBtn: HTMLButtonElement;
      renamePoseBtn: HTMLButtonElement;
      removePoseBtn: HTMLButtonElement;
      poseDialog: HTMLDialogElement;
      poseDialogForm: HTMLFormElement;
      poseDialogTitle: HTMLElement;
      poseDialogKey: HTMLSelectElement;
      poseDialogImageSelect: HTMLSelectElement;
      poseDialogImage: HTMLInputElement;
      poseDialogError: HTMLElement;
      poseDialogMode: "add" | "rename" = "add";
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
      attackHitboxAbilitySelect: HTMLSelectElement;
      projectileImageSelect: HTMLSelectElement;
      projectileImageScale: HTMLInputElement;
      projectileRotationSpeed: HTMLInputElement;
      weaponImagePath: HTMLInputElement;
      projectilePreviewAngle = 0;
      projectilePreviewTime = performance.now();
      controls: Record<ControlName, NumericInput>;
      labels: Record<ControlName, HTMLElement>;
      images: {
            body: HTMLImageElement;
            weaponIdle: HTMLImageElement;
            weaponAttack: HTMLImageElement;
            projectile: HTMLImageElement;
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
            this.poseImageSelect =
                  requireElement<HTMLSelectElement>("pose-image-select");
            this.poseImageInput =
                  requireElement<HTMLInputElement>("pose-image-path");
            this.defaultFacingSelect =
                  requireElement<HTMLSelectElement>("defaultFacing");
            this.resetPoseBtn =
                  requireElement<HTMLButtonElement>("reset-pose-btn");
            this.addPoseBtn =
                  requireElement<HTMLButtonElement>("add-pose-btn");
            this.renamePoseBtn =
                  requireElement<HTMLButtonElement>("rename-pose-btn");
            this.removePoseBtn =
                  requireElement<HTMLButtonElement>("remove-pose-btn");
            this.poseDialog =
                  requireElement<HTMLDialogElement>("pose-dialog");
            this.poseDialogForm =
                  requireElement<HTMLFormElement>("pose-dialog-form");
            this.poseDialogTitle = requireElement("pose-dialog-title");
            this.poseDialogKey =
                  requireElement<HTMLSelectElement>("pose-dialog-key");
            this.poseDialogImageSelect = requireElement<HTMLSelectElement>(
                  "pose-dialog-image-select",
            );
            this.poseDialogImage =
                  requireElement<HTMLInputElement>("pose-dialog-image");
            this.poseDialogError = requireElement("pose-dialog-error");
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
            this.attackHitboxAbilitySelect = requireElement<HTMLSelectElement>(
                  "attackHitboxAbility",
            );
            this.projectileImageSelect = requireElement<HTMLSelectElement>(
                  "projectile-image-select",
            );
            this.projectileImageScale = requireElement<HTMLInputElement>(
                  "projectileImageScale",
            );
            this.projectileRotationSpeed = requireElement<HTMLInputElement>(
                  "projectileRotationSpeed",
            );
            this.weaponImagePath =
                  requireElement<HTMLInputElement>("weaponImagePath");

            this.controls = {
                  hitboxWidth: requireElement<NumericInput>("hitboxWidth"),
                  hitboxHeight: requireElement<NumericInput>("hitboxHeight"),
                  hitboxRadius: requireElement<NumericInput>("hitboxRadius"),
                  hitboxOffsetX: requireElement<NumericInput>("hitboxOffsetX"),
                  hitboxOffsetY: requireElement<NumericInput>("hitboxOffsetY"),
                  attackHitboxWidth:
                        requireElement<NumericInput>("attackHitboxWidth"),
                  attackHitboxHeight:
                        requireElement<NumericInput>("attackHitboxHeight"),
                  attackHitboxOffsetX:
                        requireElement<NumericInput>("attackHitboxOffsetX"),
                  attackHitboxOffsetY:
                        requireElement<NumericInput>("attackHitboxOffsetY"),
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
                  weaponPivotX: requireElement<NumericInput>("weaponPivotX"),
                  weaponPivotY: requireElement<NumericInput>("weaponPivotY"),
                  swingStartDegrees:
                        requireElement<NumericInput>("swingStartDegrees"),
                  swingEndDegrees:
                        requireElement<NumericInput>("swingEndDegrees"),
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
                  attackHitboxWidth: requireElement("val-attackHitboxWidth"),
                  attackHitboxHeight: requireElement("val-attackHitboxHeight"),
                  attackHitboxOffsetX: requireElement(
                        "val-attackHitboxOffsetX",
                  ),
                  attackHitboxOffsetY: requireElement(
                        "val-attackHitboxOffsetY",
                  ),
                  imageScale: requireElement("val-imageScale"),
                  imageOffsetX: requireElement("val-imageOffsetX"),
                  imageOffsetY: requireElement("val-imageOffsetY"),
                  healthBarOffsetX: requireElement("val-healthBarOffsetX"),
                  healthBarOffsetY: requireElement("val-healthBarOffsetY"),
                  weaponScale: requireElement("val-weaponScale"),
                  weaponOffsetX: requireElement("val-weaponOffsetX"),
                  weaponOffsetY: requireElement("val-weaponOffsetY"),
                  weaponPivotX: requireElement("val-weaponPivotX"),
                  weaponPivotY: requireElement("val-weaponPivotY"),
                  swingStartDegrees:
                        requireElement("val-swingStartDegrees"),
                  swingEndDegrees: requireElement("val-swingEndDegrees"),
                  imageCropX: requireElement("val-imageCropX"),
                  imageCropY: requireElement("val-imageCropY"),
                  imageCropWidth: requireElement("val-imageCropWidth"),
                  imageCropHeight: requireElement("val-imageCropHeight"),
            };

            this.images = {
                  body: new Image(),
                  weaponIdle: new Image(),
                  weaponAttack: new Image(),
                  projectile: new Image(),
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
                  this.transformationTool.stopPreview();
                  this.activePoseKey = this.poseSelect.value;
                  this._onPoseChanged();
            });

            this.poseImageInput.addEventListener("change", () =>
                  this._updateCurrentPoseImage(),
            );
            this.poseImageSelect.addEventListener("change", () => {
                  if (!this.poseImageSelect.value) return;
                  this.poseImageInput.value = this.poseImageSelect.value;
                  this._updateCurrentPoseImage();
            });
            this.poseImageInput.addEventListener("keydown", (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  this._updateCurrentPoseImage();
                  this.poseImageInput.select();
            });
            this.addPoseBtn.addEventListener("click", () =>
                  this._openPoseDialog("add"),
            );
            this.renamePoseBtn.addEventListener("click", () =>
                  this._openPoseDialog("rename"),
            );
            this.removePoseBtn.addEventListener("click", () =>
                  this._removeCurrentPose(),
            );
            this.poseDialogForm.addEventListener("submit", (event) => {
                  event.preventDefault();
                  this._commitPoseDialog();
            });
            this.poseDialogImageSelect.addEventListener("change", () => {
                  if (this.poseDialogImageSelect.value) {
                        this.poseDialogImage.value =
                              this.poseDialogImageSelect.value;
                  }
            });
            ["pose-dialog-close", "pose-dialog-cancel"].forEach((id) => {
                  requireElement<HTMLButtonElement>(id).addEventListener(
                        "click",
                        () => this.poseDialog.close(),
                  );
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

            this.attackHitboxAbilitySelect.addEventListener("change", () => {
                  this._syncAttackHitboxControls();
                  this._draw();
            });

            this.projectileImageSelect.addEventListener("change", () => {
                  this._loadProjectilePreview();
                  this._syncProjectileControls();
                  this._draw();
            });
            [this.projectileImageScale, this.projectileRotationSpeed].forEach(
                  (input) => {
                        input.addEventListener("input", () => {
                              if (this.isRestoring) return;
                              this._updateProjectileConfig();
                              this._draw();
                        });
                        input.addEventListener("change", () => {
                              if (!this.isRestoring) this._saveState();
                        });
                  },
            );

            const updateWeaponImage = () => {
                  const config = this._currentConfig();
                  config.weaponIdle = this.weaponImagePath.value.trim() || null;
                  this.images.weaponIdle.src = config.weaponIdle
                        ? "../../" + config.weaponIdle
                        : "";
                  this._draw();
                  this._saveState();
            };
            this.weaponImagePath.addEventListener("change", updateWeaponImage);
            this.weaponImagePath.addEventListener("keydown", (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  updateWeaponImage();
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
            this.images.projectile.onload = () => this._draw();

            const animateProjectile = (now: number) => {
                  const elapsedFrames = Math.min(
                        (now - this.projectilePreviewTime) / (1000 / 60),
                        4,
                  );
                  this.projectilePreviewTime = now;
                  const action = this._projectileAction();
                  if (action) {
                        this.projectilePreviewAngle +=
                              (action.projectile.rotationSpeed ?? 0) *
                              elapsedFrames;
                        this._draw();
                  }
                  requestAnimationFrame(animateProjectile);
            };
            requestAnimationFrame(animateProjectile);

            this.transformationTool = new TransformationTool(this);
            this.aimTool = new AimTool(this);
            this._loadCurrentConfig();
      }

      _currentConfig(): StudioConfig {
            return this.configs[this.activeConfigIndex];
      }

      _projectileAction() {
            for (const ability of this._editingAbilities()) {
                  const action = ability.actions.find(
                        (candidate) => candidate.type === "spawn-projectile",
                  );
                  if (action?.type === "spawn-projectile") return action;
            }
            return null;
      }

      _swingAction() {
            for (const ability of this._editingAbilities()) {
                  const action = ability.actions.find(
                        (candidate) => candidate.type === "swing",
                  );
                  if (action?.type === "swing") return action;
            }
            return null;
      }

      _attackHitboxAction(): AttackHitboxAction | null {
            const abilityId = this.attackHitboxAbilitySelect.value;
            const ability = this._editingAbilities().find(
                  (candidate) => candidate.id === abilityId,
            );
            return (
                  ability?.actions.find(
                        (candidate): candidate is AttackHitboxAction =>
                              candidate.type === "attack-hitbox",
                  ) ?? null
            );
      }

      _populateAttackHitboxSelect(): void {
            const previous = this.attackHitboxAbilitySelect.value;
            const abilities = this._editingAbilities().filter((ability) =>
                  ability.actions.some((action) => action.type === "attack-hitbox"),
            );
            this.attackHitboxAbilitySelect.replaceChildren();
            for (const ability of abilities) {
                  const option = document.createElement("option");
                  option.value = ability.id;
                  option.textContent = ability.id;
                  this.attackHitboxAbilitySelect.appendChild(option);
            }
            if (abilities.some((ability) => ability.id === previous)) {
                  this.attackHitboxAbilitySelect.value = previous;
            }
            const hasAttackHitbox = abilities.length > 0;
            requireElement<HTMLElement>("attack-hitbox-controls").hidden =
                  !hasAttackHitbox;
            requireElement<HTMLElement>("no-attack-hitbox-message").hidden =
                  hasAttackHitbox;
            this._syncAttackHitboxControls();
      }

      _syncAttackHitboxControls(): void {
            const action = this._attackHitboxAction();
            if (action) {
                  for (const [key, value] of [
                        ["attackHitboxOffsetX", action.offset.x],
                        ["attackHitboxOffsetY", action.offset.y],
                  ] as const) {
                        this.controls[key].min = String(Math.min(-250, value));
                        this.controls[key].max = String(Math.max(250, value));
                  }
            }
            this.controls.attackHitboxWidth.value = action?.width ?? 40;
            this.controls.attackHitboxHeight.value = action?.height ?? 100;
            this.controls.attackHitboxOffsetX.value = action?.offset.x ?? 40;
            this.controls.attackHitboxOffsetY.value = action?.offset.y ?? 0;
            for (const key of [
                  "attackHitboxWidth",
                  "attackHitboxHeight",
                  "attackHitboxOffsetX",
                  "attackHitboxOffsetY",
            ] as const) {
                  this.controls[key].disabled = !action;
            }
      }

      _syncSwingControls(): void {
            const action = this._swingAction();
            this.controls.swingStartDegrees.disabled = !action;
            this.controls.swingEndDegrees.disabled = !action;
            this.controls.swingStartDegrees.value = action?.startDegrees ?? 0;
            this.controls.swingEndDegrees.value = action?.endDegrees ?? 0;
      }

      _projectileImages(): string[] {
            const action = this._projectileAction();
            if (!action) return [];
            return Array.isArray(action.projectile.image)
                  ? action.projectile.image
                  : [action.projectile.image];
      }

      _populateProjectileSelect(): void {
            const images = this._projectileImages();
            const previous = this.projectileImageSelect.value;
            this.projectileImageSelect.replaceChildren();
            images.forEach((path) => {
                  const option = document.createElement("option");
                  option.value = path;
                  option.textContent = path.split("/").pop() ?? path;
                  option.title = path;
                  this.projectileImageSelect.appendChild(option);
            });
            if (images.includes(previous))
                  this.projectileImageSelect.value = previous;
            const hasProjectile = images.length > 0;
            requireElement<HTMLElement>("projectile-controls").hidden =
                  !hasProjectile;
            requireElement<HTMLElement>("no-projectile-message").hidden =
                  hasProjectile;
            this._loadProjectilePreview();
            this._syncProjectileControls();
      }

      _loadProjectilePreview(): void {
            const path = this.projectileImageSelect.value;
            if (path) this.images.projectile.src = "../../" + path;
            else this.images.projectile.removeAttribute("src");
            this.projectilePreviewAngle = 0;
      }

      _syncProjectileControls(): void {
            const action = this._projectileAction();
            const path = this.projectileImageSelect.value;
            const enabled = Boolean(action && path);
            this.projectileImageScale.disabled = !enabled;
            this.projectileRotationSpeed.disabled = !enabled;
            if (!action) return;
            this.projectileImageScale.value = String(
                  action.projectile.imageScales?.[path] ?? 1,
            );
            this.projectileRotationSpeed.value = String(
                  action.projectile.rotationSpeed ?? 0,
            );
            requireElement<HTMLElement>(
                  "val-projectileImageScale",
            ).textContent = Number(this.projectileImageScale.value).toFixed(2);
            requireElement<HTMLElement>(
                  "val-projectileRotationSpeed",
            ).textContent = Number(this.projectileRotationSpeed.value).toFixed(
                  2,
            );
      }

      _updateProjectileConfig(): void {
            const action = this._projectileAction();
            const path = this.projectileImageSelect.value;
            if (!action || !path) return;
            action.projectile.imageScales ??= {};
            action.projectile.imageScales[path] = Number(
                  this.projectileImageScale.value,
            );
            action.projectile.rotationSpeed = Number(
                  this.projectileRotationSpeed.value,
            );
            this._syncProjectileControls();
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
            return this._poseBank(config)[poseKey];
      }

      /** Return the image path for a given pose key. */
      _getPoseImagePath(config: StudioConfig, poseKey: string): string {
            if (poseKey === "base") return config.image ?? "";
            const poseVal = this._poseBank(config)[poseKey];
            if (!poseVal) return config.image ?? "";
            if (typeof poseVal === "string") return poseVal;
            return poseVal.image ?? config.image ?? "";
      }

      /** Update an image path without disturbing that sprite's visual edits. */
      _setPoseImagePath(
            config: StudioConfig,
            poseKey: string,
            imagePath: string,
      ): void {
            if (poseKey === "base") {
                  config.image = imagePath;
                  return;
            }
            const poses = this._poseBank(config);
            const existing = poses[poseKey];
            poses[poseKey] =
                  existing && typeof existing === "object"
                        ? { ...existing, image: imagePath }
                        : {
                                image: imagePath,
                                imageScale: config.imageScale,
                                imageOffset: { ...config.imageOffset },
                                imageCrop: config.imageCrop
                                      ? { ...config.imageCrop }
                                      : null,
                          };
      }

      _availableSpritePaths(config: StudioConfig): string[] {
            const configuredPaths = [
                  config.image,
                  ...Object.values(config.poses ?? {}).map((pose) =>
                        typeof pose === "string" ? pose : pose.image,
                  ),
                  ...Object.values(config.transformation?.poses ?? {}).map((pose) =>
                        typeof pose === "string" ? pose : pose.image,
                  ),
            ].filter((path): path is string => Boolean(path));
            const directories = new Set(
                  configuredPaths
                        .map((path) => path.slice(0, path.lastIndexOf("/") + 1))
                        .filter((path) => path.includes("/sprites/")),
            );
            if (directories.size === 0) {
                  directories.add(`assets/fighters/${config.id}/sprites/`);
            }
            return spriteCatalog.filter((path) =>
                  [...directories].some((directory) =>
                        path.startsWith(directory),
                  ),
            );
      }

      _populateSpriteImageSelect(
            select: HTMLSelectElement,
            selectedPath: string,
      ): void {
            select.replaceChildren();
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Choose an image…";
            select.appendChild(placeholder);
            const availablePaths = this._availableSpritePaths(
                  this._currentConfig(),
            );
            availablePaths.forEach((path) => {
                  const option = document.createElement("option");
                  option.value = path;
                  option.textContent = path.split("/").pop() ?? path;
                  option.title = path;
                  select.appendChild(option);
            });
            select.disabled = availablePaths.length === 0;
            select.value = availablePaths.includes(selectedPath)
                  ? selectedPath
                  : "";
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
            const poseVal = this._poseBank(config)[poseKey];
            const poseObj: Partial<Exclude<PoseConfig, string>> =
                  poseVal && typeof poseVal === "object" ? poseVal : {};
            return {
                  imageScale: poseObj.imageScale ?? config.imageScale ?? 1,
                  imageOffset: poseObj.imageOffset ??
                        config.imageOffset ?? { x: 0, y: 0 },
                  imageCrop:
                        "imageCrop" in poseObj
                              ? poseObj.imageCrop ?? null
                              : config.imageCrop ?? null,
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
            const poses = this._poseBank(config);
            const existing = poses[poseKey];
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
            poses[poseKey] = poseObj;
      }

      /** Show one Idle entry, using the legacy default only when no idle pose exists. */
      _populatePoseSelect(config: StudioConfig): void {
            if (!this.poseSelect) return;
            this.poseSelect.innerHTML = "";
            const addOpt = (value: string, label: string) => {
                  const opt = document.createElement("option");
                  opt.value = value;
                  opt.textContent = label;
                  this.poseSelect.appendChild(opt);
            };
            const poses = this._poseBank(config);
            if (this.activeForm === "base" && !poses.idle) addOpt("base", poseLabel("base"));
            for (const key of SUPPORTED_POSE_KEYS) {
                  if (key in poses || this.activeForm === "transformed" && key === "idle") addOpt(key, poseLabel(key));
            }
            // Preserve any older custom entries so they remain editable instead
            // of silently disappearing from the Studio.
            for (const key of Object.keys(poses)) {
                  if (!SUPPORTED_POSE_KEYS.includes(key as typeof SUPPORTED_POSE_KEYS[number])) {
                        addOpt(key, poseLabel(key));
                  }
            }
            // Keep or reset activePoseKey to something valid
            const validKeys = Array.from(this.poseSelect.options, (option) => option.value);
            if (!validKeys.includes(this.activePoseKey)) {
                  this.activePoseKey = validKeys[0] ?? "base";
            }
            this.poseSelect.value = this.activePoseKey;
            this._updatePoseActionButtons();
      }

      _updatePoseActionButtons() {
            if (!this.resetPoseBtn) return;
            const isBase = this.activePoseKey === "base";
            this.resetPoseBtn.disabled = isBase;
            this.renamePoseBtn.disabled = isBase;
            this.removePoseBtn.disabled = isBase;
            this.addPoseBtn.disabled = this.activeForm === "base" && SUPPORTED_POSE_KEYS.every(
                  (key) => key in this._poseBank(),
            );
            this.poseImageInput.value = this._getPoseImagePath(
                  this._currentConfig(),
                  this.activePoseKey,
            );
            this._populateSpriteImageSelect(
                  this.poseImageSelect,
                  this.poseImageInput.value,
            );
      }

      /** Called when the pose selector changes. Load new image and sync controls. */
      _onPoseChanged() {
            this.mode = "default";
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.hitboxDraftOffset = null;
            this.dragState = null;
            _updateCropButtons(this);
            this._updateHitboxButtons();
            this._syncHitboxControls(this._currentConfig());
            this._updatePoseActionButtons();
            const config = this._currentConfig();
            this._syncImageControls();
            this._refreshLabels();
            const imagePath = this._getPoseImagePath(
                  config,
                  this.activePoseKey,
            );
            _loadBodyImage(this, imagePath, this.activePoseKey);
      }

      _updateCurrentPoseImage(): void {
            const imagePath = this.poseImageInput.value.trim();
            const config = this._currentConfig();
            const previous = this._getPoseImagePath(config, this.activePoseKey);
            if (!imagePath) {
                  this.poseImageInput.value = previous;
                  return;
            }
            if (imagePath === previous) return;
            this._setPoseImagePath(config, this.activePoseKey, imagePath);
            this._populateSpriteImageSelect(this.poseImageSelect, imagePath);
            _loadBodyImage(this, imagePath, this.activePoseKey);
            this._saveState();
      }

      _openPoseDialog(mode: "add" | "rename"): void {
            if (mode === "rename" && this.activePoseKey === "base") return;
            const poses = this._poseBank();
            const availableKeys = SUPPORTED_POSE_KEYS.filter(
                  (key) =>
                        !(key in poses) ||
                        (mode === "rename" && key === this.activePoseKey),
            );
            if (availableKeys.length === 0 && this.activeForm === "base") return;

            this.poseDialogMode = mode;
            this.poseDialogTitle.textContent =
                  mode === "add" ? "Add Sprite" : "Rename Sprite";
            this.poseDialogKey.replaceChildren();
            requireElement<HTMLInputElement>("pose-dialog-custom-key").hidden = this.activeForm !== "transformed";
            requireElement<HTMLInputElement>("pose-dialog-custom-key").value = "";
            availableKeys.forEach((key) => {
                  const option = document.createElement("option");
                  option.value = key;
                  option.textContent = poseLabel(key);
                  this.poseDialogKey.appendChild(option);
            });
            const selectedImagePath =
                  mode === "rename"
                        ? this._getPoseImagePath(
                                this._currentConfig(),
                                this.activePoseKey,
                          )
                        : "";
            this._populateSpriteImageSelect(
                  this.poseDialogImageSelect,
                  selectedImagePath,
            );
            if (mode === "rename") {
                  this.poseDialogKey.value = this.activePoseKey;
                  if (this.activeForm === "transformed" && !SUPPORTED_POSE_KEYS.includes(this.activePoseKey as typeof SUPPORTED_POSE_KEYS[number])) {
                        requireElement<HTMLInputElement>("pose-dialog-custom-key").value = this.activePoseKey;
                  }
                  this.poseDialogImage.value = selectedImagePath;
            } else {
                  this.poseDialogImage.value = "";
            }
            this.poseDialogError.textContent = "";
            this.poseDialog.showModal();
            queueMicrotask(() =>
                  mode === "add"
                        ? this.poseDialogImage.focus()
                        : this.poseDialogKey.focus(),
            );
      }

      _commitPoseDialog(): void {
            const customKey = requireElement<HTMLInputElement>("pose-dialog-custom-key").value.trim();
            const nextKey = this.activeForm === "transformed" && customKey ? customKey : this.poseDialogKey.value;
            const imagePath = this.poseDialogImage.value.trim();
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(nextKey) || ["base", "constructor", "prototype"].includes(nextKey) || (this.activeForm === "base" && !SUPPORTED_POSE_KEYS.includes(nextKey as typeof SUPPORTED_POSE_KEYS[number]))) {
                  this.poseDialogError.textContent = "Choose a supported game pose.";
                  return;
            }
            if (!imagePath) {
                  this.poseDialogError.textContent = "Enter the sprite image path.";
                  this.poseDialogImage.focus();
                  return;
            }

            const config = this._currentConfig();
            const poses = this._poseBank(config);
            const oldKey = this.activePoseKey;
            if (
                  nextKey in poses &&
                  !(this.poseDialogMode === "rename" && nextKey === oldKey)
            ) {
                  this.poseDialogError.textContent = `${poseLabel(nextKey)} already has a sprite.`;
                  return;
            }

            if (this.poseDialogMode === "add") {
                  poses[nextKey] = {
                        image: imagePath,
                        imageScale: config.imageScale,
                        imageOffset: { ...config.imageOffset },
                        imageCrop: null,
                  };
            } else {
                  const existing = poses[oldKey];
                  if (!existing) return;
                  delete poses[oldKey];
                  poses[nextKey] =
                        typeof existing === "string"
                              ? imagePath
                              : { ...existing, image: imagePath };
                  if (this.activeForm === "transformed") {
                        config.transformation?.sequence?.forEach((step) => {
                              if (step.pose === oldKey) step.pose = nextKey;
                        });
                  }
            }

            this.activePoseKey = nextKey;
            this._populatePoseSelect(config);
            this._onPoseChanged();
            this._saveState();
            this.poseDialog.close();
            this.transformationTool.sync();
      }

      _removeCurrentPose(): void {
            if (this.activePoseKey === "base") return;
            const label = poseLabel(this.activePoseKey);
            if (!window.confirm(`Remove the ${label} sprite? You can undo this change.`)) {
                  return;
            }
            const config = this._currentConfig();
            const poses = this._poseBank(config);
            if (!poses[this.activePoseKey]) return;
            delete poses[this.activePoseKey];
            if (this.activeForm === "transformed" && config.transformation) {
                  config.transformation.sequence = config.transformation.sequence?.filter((step) => step.pose !== this.activePoseKey);
            }
            this.activePoseKey = "base";
            this._populatePoseSelect(config);
            this._onPoseChanged();
            this._saveState();
            this.transformationTool.sync();
      }

      /** Reset this sprite to a snapshot of the base visual without coupling it. */
      _resetCurrentPose() {
            if (this.activePoseKey === "base") return;
            const config = this._currentConfig();
            const poseVal = this._poseBank(config)[this.activePoseKey];
            if (!poseVal) return;
            const imagePath = this._getPoseImagePath(
                  config,
                  this.activePoseKey,
            );
            this._poseBank(config)[this.activePoseKey] = {
                  image: imagePath,
                  imageScale: config.imageScale,
                  imageOffset: { ...config.imageOffset },
                  imageCrop: config.imageCrop
                        ? { ...config.imageCrop }
                        : null,
            };
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
            config.weaponPivot ??= structuredClone(
                  this.defaults?.presentation.weaponPivot ?? { x: 0, y: 0 },
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
            this.transformationTool.stopPreview();
            this.activeForm = "base";
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
            this.transformationTool.sync();

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
            this.controls.weaponPivotX.value = config.weaponPivot.x;
            this.controls.weaponPivotY.value = config.weaponPivot.y;
            this._syncSwingControls();
            this._populateAttackHitboxSelect();
            this.weaponImagePath.value = config.weaponIdle ?? "";

            // The visible Idle entry may be an explicit pose or the legacy default.
            const imagePath = this._getPoseImagePath(config, this.activePoseKey);
            _loadBodyImage(this, imagePath, this.activePoseKey);
            this.images.weaponIdle.src = "../../" + (config.weaponIdle || "");
            this.images.weaponAttack.src =
                  "../../" + (config.weaponAttack || "");
            this._populateProjectileSelect();

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
                  this.activeForm,
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
            config.image = state.image;
            config.imageScale = state.imageScale;
            config.imageOffset = { ...state.imageOffset };
            config.imageCrop = state.imageCrop ? { ...state.imageCrop } : null;
            config.healthBarOffset = { ...state.healthBarOffset };
            config.weaponScale = state.weaponScale;
            config.weaponOffset = { ...state.weaponOffset };
            config.weaponPivot = { ...state.weaponPivot };
            config.weaponIdle = state.weaponIdle;
            this.weaponImagePath.value = config.weaponIdle ?? "";
            this.images.weaponIdle.src = config.weaponIdle
                  ? "../../" + config.weaponIdle
                  : "";
            config.skills = structuredClone(state.skills);
            config.abilities = structuredClone(state.abilities);
            config.transformation = structuredClone(state.transformation ?? null);
            this.activeForm = state.activeForm ?? "base";
            this.transformationTool.stopPreview();
            this.transformationTool.sync();

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
            this.controls.weaponPivotX.value = config.weaponPivot.x;
            this.controls.weaponPivotY.value = config.weaponPivot.y;
            this._syncSwingControls();
            this._populateAttackHitboxSelect();
            this._populateProjectileSelect();

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
            config.weaponPivot = {
                  x: Math.round(numberValue(this.controls.weaponPivotX)),
                  y: Math.round(numberValue(this.controls.weaponPivotY)),
            };
            const swing = this._swingAction();
            if (swing) {
                  swing.startDegrees = numberValue(
                        this.controls.swingStartDegrees,
                  );
                  swing.endDegrees = numberValue(
                        this.controls.swingEndDegrees,
                  );
            }
            const attackHitbox = this._attackHitboxAction();
            if (attackHitbox) {
                  attackHitbox.width = Math.max(
                        1,
                        numberValue(this.controls.attackHitboxWidth),
                  );
                  attackHitbox.height = Math.max(
                        1,
                        numberValue(this.controls.attackHitboxHeight),
                  );
                  attackHitbox.offset = {
                        x: numberValue(this.controls.attackHitboxOffsetX),
                        y: numberValue(this.controls.attackHitboxOffsetY),
                  };
            }

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
            this.aimTool?.sync();
            drawStudio(this);
            this.aimTool?.draw();
      }
}
