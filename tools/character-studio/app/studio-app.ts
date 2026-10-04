import { _loadBodyImage } from "../assets/image-loader";
import { _refreshImageOutput, _applyImageOutput } from "../panels/pose-panel";
import { applyControlEdit } from "../panels/control-edits";
import { normalizeFighterDocument } from "../document/fighter-document";
import { AutosaveQueue } from "../persistence/autosave";
import { downloadFighterFile } from "../persistence/file-access";
import { syncStudioControls } from "../ui/studio-controls";
import { updateSaveStatus } from "../ui/status-bar";
import {
      _getPoseImagePath,
      _setPoseImagePath,
      _availableSpritePaths,
      _getPoseVisual,
      _setPoseVisual,
} from "../document/pose-model";
import {
      _populateSpriteImageSelect,
      _populatePoseSelect,
      _updatePoseActionButtons,
      _onPoseChanged,
      _updateCurrentPoseImage,
      _syncImageControls,
} from "../panels/pose-panel";
import {
      _openPoseDialog,
      _commitPoseDialog,
      _removeCurrentPose,
      _resetCurrentPose,
} from "../panels/pose-dialog";
import {
      _projectileAction,
      _projectileImages,
      _populateProjectileSelect,
      _loadProjectilePreview,
      _syncProjectileControls,
      _updateProjectileConfig,
} from "../panels/projectile-panel";
import {
      _swingAction,
      _attackHitboxAction,
      _populateAttackHitboxSelect,
      _syncAttackHitboxControls,
      _syncSwingControls,
} from "../panels/weapon-panel";
// Coordinates Studio dependencies, selection, and high-level editor actions.
import { StudioElements } from "../ui/studio-elements";
import { EditorSession } from "./editor-session";
import { installStudioEvents } from "./studio-events";
import type { IndicatorConfig } from "../../../src/types/game";
import type { MeleeSettings } from "../../../src/config/component-settings";
import type {
      FighterConfig,
      FighterDefaults,
      FighterDefinition,
      ImageCrop,
      PoseConfig,
      Vector2,
} from "../../../src/types/fighter";
import { drawStudio } from "../preview/preview-renderer";
import { AimTool } from "../tools/aim/aim-tool";
import { getSaveContent } from "../persistence/fighter-serializer";
import {
      _updateCropButtons,
      _enterCropMode,
      _applyCrop,
      _cancelCrop,
} from "../tools/crop/crop-tool";
import { FormTool } from "../panels/form-panel";
import { poseBank, type StudioForm } from "../document/form-model";
import {
      applyHitbox,
      applyHitboxOutput,
      cancelHitbox,
      enterHitboxMode,
      refreshHitboxOutput,
      syncHitboxControls,
      syncHitboxControlState,
      syncHitboxOffsetControls,
      updateHitboxButtons,
} from "../tools/body-hitbox/body-hitbox-tool";
import type {
      ControlName,
      DragState,
      EditableHitbox,
      PosePatch,
      PoseVisual,
      StudioConfig,
      StudioFileHandle,
} from "./editor-types";
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

export interface CharacterStudio extends StudioElements {}

export class CharacterStudio {
      formTool!: FormTool;
      aimTool!: AimTool;

      _poseBank(config = this._currentConfig()): Record<string, PoseConfig> {
            return poseBank(config, this.activeForm);
      }

      _editingComponents() {
            const config = this._currentConfig();
            return this.activeForm === "base"
                  ? config.components
                  : (config.forms[this.activeForm]?.components ?? config.components);
      }

      _refreshForm(): void {
            this.mode = "default";
            this.dragState = null;
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.hitboxDraftOffset = null;
            this.activePoseKey =
                  this.activeForm === "base" ? "base" : "idle";
            this._populatePoseSelect(this._currentConfig());
            this._populateAttackHitboxSelect();
            this._populateProjectileSelect();
            this._syncSwingControls();
            this._syncHitboxControls(this._currentConfig());
            this._updateHitboxButtons();
            _updateCropButtons(this);
            this.formTool.sync();
            this._onPoseChanged();
            this._draw();
      }
      readonly session: EditorSession;
      readonly autosave = new AutosaveQueue();
      fileHandles: Map<string, StudioFileHandle>;
      get configs(): StudioConfig[] {
            return this.session.configs;
      }
      set configs(value: StudioConfig[]) {
            this.session.configs = value;
      }
      get activeConfigIndex(): number {
            return this.session.activeConfigIndex;
      }
      set activeConfigIndex(value: number) {
            this.session.activeConfigIndex = value;
      }
      get activePoseKey(): string {
            return this.session.activePoseKey;
      }
      set activePoseKey(value: string) {
            this.session.activePoseKey = value;
      }
      get activeForm(): StudioForm {
            return this.session.activeForm;
      }
      set activeForm(value: StudioForm) {
            this.session.activeForm = value;
      }
      get history(): string[] {
            return this.session.history;
      }
      set history(value: string[]) {
            this.session.history = value;
      }
      get historyIndex(): number {
            return this.session.historyIndex;
      }
      set historyIndex(value: number) {
            this.session.historyIndex = value;
      }
      get isRestoring(): boolean {
            return this.session.isRestoring;
      }
      set isRestoring(value: boolean) {
            this.session.isRestoring = value;
      }
      get mode(): "default" | "crop" | "hitbox" {
            return this.session.mode;
      }
      set mode(value: "default" | "crop" | "hitbox") {
            this.session.mode = value;
      }
      get cropDraft(): ImageCrop | null {
            return this.session.cropDraft;
      }
      set cropDraft(value: ImageCrop | null) {
            this.session.cropDraft = value;
      }
      get hitboxDraft(): EditableHitbox | null {
            return this.session.hitboxDraft;
      }
      set hitboxDraft(value: EditableHitbox | null) {
            this.session.hitboxDraft = value;
      }
      get hitboxDraftOffset(): Vector2 | null {
            return this.session.hitboxDraftOffset;
      }
      set hitboxDraftOffset(value: Vector2 | null) {
            this.session.hitboxDraftOffset = value;
      }
      get dragState(): DragState | null {
            return this.session.dragState;
      }
      set dragState(value: DragState | null) {
            this.session.dragState = value;
      }
      pendingBodyImageRequest: number;
      constructor(
            configs: FighterConfig[],
            private readonly fighterDefinitions: FighterDefinition[],
            readonly indicatorConfig: IndicatorConfig,
            readonly defaults?: FighterDefaults,
      ) {
            Object.assign(this, new StudioElements());
            this.session = new EditorSession(configs as StudioConfig[]);
            this.fileHandles = new Map();
            this.pendingBodyImageRequest = 0;
            this.autosave.subscribe(updateSaveStatus);
            this.formTool = new FormTool(this);
            this.aimTool = new AimTool(this);
            installStudioEvents(this);
            this._loadCurrentConfig();
      }

      _currentConfig(): StudioConfig {
            return this.configs[this.activeConfigIndex];
      }

      _projectileAction() {
            return _projectileAction(this);
      }

      _swingAction() {
            return _swingAction(this);
      }

      _attackHitboxAction(): NonNullable<MeleeSettings["hitbox"]> | null {
            return _attackHitboxAction(this);
      }

      _populateAttackHitboxSelect(): void {
            return _populateAttackHitboxSelect(this);
      }

      _syncAttackHitboxControls(): void {
            return _syncAttackHitboxControls(this);
      }

      _syncSwingControls(): void {
            return _syncSwingControls(this);
      }

      _projectileImages(): string[] {
            return _projectileImages(this);
      }

      _populateProjectileSelect(): void {
            return _populateProjectileSelect(this);
      }

      _loadProjectilePreview(): void {
            return _loadProjectilePreview(this);
      }

      _syncProjectileControls(): void {
            return _syncProjectileControls(this);
      }

      _updateProjectileConfig(): void {
            return _updateProjectileConfig(this);
      }

      _getPoseImagePath(config: StudioConfig, poseKey: string): string {
            return _getPoseImagePath(this, config, poseKey);
      }

      _setPoseImagePath(
            config: StudioConfig,
            poseKey: string,
            imagePath: string,
      ): void {
            return _setPoseImagePath(this, config, poseKey, imagePath);
      }

      _availableSpritePaths(config: StudioConfig): string[] {
            return _availableSpritePaths(this, config);
      }

      _populateSpriteImageSelect(
            select: HTMLSelectElement,
            selectedPath: string,
      ): void {
            return _populateSpriteImageSelect(this, select, selectedPath);
      }

      _getPoseVisual(config: StudioConfig, poseKey: string): PoseVisual {
            return _getPoseVisual(this, config, poseKey);
      }

      _setPoseVisual(
            config: StudioConfig,
            poseKey: string,
            patch: PosePatch,
      ): void {
            return _setPoseVisual(this, config, poseKey, patch);
      }

      _populatePoseSelect(config: StudioConfig): void {
            return _populatePoseSelect(this, config);
      }

      _updatePoseActionButtons() {
            return _updatePoseActionButtons(this);
      }

      _onPoseChanged() {
            return _onPoseChanged(this);
      }

      _updateCurrentPoseImage(): void {
            return _updateCurrentPoseImage(this);
      }

      _openPoseDialog(mode: "add" | "rename"): void {
            return _openPoseDialog(this, mode);
      }

      _commitPoseDialog(): void {
            return _commitPoseDialog(this);
      }

      _removeCurrentPose(): void {
            return _removeCurrentPose(this);
      }

      _resetCurrentPose() {
            return _resetCurrentPose(this);
      }

      _syncImageControls() {
            return _syncImageControls(this);
      }

      _ensureConfigShape(config: StudioConfig): void {
            normalizeFighterDocument(config, this.defaults);
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

      _syncHitboxControls(config: StudioConfig): void {
            syncHitboxControls(this, config);
      }
      _syncHitboxOffsetControls(offset: Vector2): void {
            syncHitboxOffsetControls(this, offset);
      }

      _loadCurrentConfig(): void {
            this.formTool.stopPreview();
            this.activeForm = "base";
            this.activePoseKey = "base";
            this.session.clearDrafts();
            this._ensureConfigShape(this._currentConfig());
            this._refreshEditor();
            if (!this.history.length) this.session.resetHistory();
      }

      _refreshEditor(): void {
            this.formTool.stopPreview();
            const config = this._currentConfig();
            this._updateSaveButton();

            this._populatePoseSelect(config);
            this.formTool.sync();

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
            const imagePath = this._getPoseImagePath(
                  config,
                  this.activePoseKey,
            );
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
            syncStudioControls(this);
      }

      _refreshHitboxOutput() {
            refreshHitboxOutput(this);
      }

      _refreshImageOutput(): void {
            _refreshImageOutput(this);
      }

      _applyImageOutput(): void {
            _applyImageOutput(this);
      }

      _applyHitboxOutput() {
            applyHitboxOutput(this);
      }
      _saveState(): void {
            if (this.session.commit()) void this._saveToLocalFile();
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

      async _saveToLocalFile(config = this._currentConfig()): Promise<void> {
            const handle = this.fileHandles.get(config.id);
            if (!handle) return;
            try {
                  await this.autosave.enqueue(
                        handle,
                        this._getSaveContent(config),
                  );
            } catch (error) {
                  console.error(`Failed to save ${config.id}:`, error);
            }
      }

      undo(): void {
            if (!this.session.undo()) return;
            this._refreshEditor();
            void this._saveToLocalFile();
      }

      redo(): void {
            if (!this.session.redo()) return;
            this._refreshEditor();
            void this._saveToLocalFile();
      }

      _restoreState(stateString: string): void {
            this.session.restore(stateString);
            this._refreshEditor();
      }

      _updateConfigFromInputs(key?: ControlName | "hitboxType"): void {
            applyControlEdit(this, key);
      }

      _draw(): void {
            this.aimTool?.sync();
            drawStudio(this);
            this.aimTool?.draw();
            syncStudioControls(this);
      }
}
