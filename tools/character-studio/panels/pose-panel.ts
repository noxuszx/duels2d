import type { Vector2 } from "../../../src/types/fighter";
import type {
      ControlName,
      EditableHitbox,
      NumericInput,
      PosePatch,
      StudioConfig,
} from "../app/editor-types";
import {
      SUPPORTED_POSE_KEYS,
      type PoseModelHost,
} from "../document/pose-model";
import { poseLabel } from "../document/pose-label";
import {
      _clampCrop,
      _loadBodyImage,
      _syncCropControls,
      _updateCropButtons,
      type CropToolHost,
} from "../tools/crop/crop-tool";
import type { StudioForm } from "../document/form-model";

export interface PosePanelHost extends CropToolHost, PoseModelHost {
      activeForm: StudioForm;
      hitboxDraft: EditableHitbox | null;
      hitboxDraftOffset: Vector2 | null;
      controls: Record<ControlName, NumericInput>;
      imageOutput: HTMLInputElement;
      _refreshImageOutput(): void;
      poseSelect: HTMLSelectElement;
      poseImageSelect: HTMLSelectElement;
      poseImageInput: HTMLInputElement;
      resetPoseBtn: HTMLButtonElement;
      renamePoseBtn: HTMLButtonElement;
      removePoseBtn: HTMLButtonElement;
      addPoseBtn: HTMLButtonElement;
      _availableSpritePaths(config: StudioConfig): string[];
      _populateSpriteImageSelect(
            select: HTMLSelectElement,
            selectedPath: string,
      ): void;
      _updatePoseActionButtons(): void;
      _updateHitboxButtons(): void;
      _syncHitboxControls(config: StudioConfig): void;
      _setPoseImagePath(
            config: StudioConfig,
            poseKey: string,
            imagePath: string,
      ): void;
}

export function _populateSpriteImageSelect(
      host: PosePanelHost,
      select: HTMLSelectElement,
      selectedPath: string,
): void {
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose an image…";
      select.appendChild(placeholder);
      const availablePaths = host._availableSpritePaths(host._currentConfig());
      availablePaths.forEach((path) => {
            const option = document.createElement("option");
            option.value = path;
            option.textContent = path.split("/").pop() ?? path;
            option.title = path;
            select.appendChild(option);
      });
      select.disabled = availablePaths.length === 0;
      select.value = availablePaths.includes(selectedPath) ? selectedPath : "";
}

export function _populatePoseSelect(
      host: PosePanelHost,
      config: StudioConfig,
): void {
      if (!host.poseSelect) return;
      host.poseSelect.innerHTML = "";
      const addOpt = (value: string, label: string) => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = label;
            host.poseSelect.appendChild(opt);
      };
      const poses = host.activeForm === "base"
            ? host._poseBank(config)
            : { ...config.poses, ...host._poseBank(config) };
      if (host.activeForm === "base" && !poses.idle)
            addOpt("base", poseLabel("base"));
      for (const key of SUPPORTED_POSE_KEYS) {
            if (
                  key in poses ||
                  (host.activeForm !== "base" && key === "idle")
            )
                  addOpt(key, poseLabel(key));
      }
      // Preserve any older custom entries so they remain editable instead
      // of silently disappearing from the Studio.
      for (const key of Object.keys(poses)) {
            if (
                  !SUPPORTED_POSE_KEYS.includes(
                        key as (typeof SUPPORTED_POSE_KEYS)[number],
                  )
            ) {
                  addOpt(key, poseLabel(key));
            }
      }
      // Keep or reset activePoseKey to something valid
      const validKeys = Array.from(
            host.poseSelect.options,
            (option) => option.value,
      );
      if (!validKeys.includes(host.activePoseKey)) {
            host.activePoseKey = validKeys[0] ?? "base";
      }
      host.poseSelect.value = host.activePoseKey;
      host._updatePoseActionButtons();
}

export function _updatePoseActionButtons(host: PosePanelHost) {
      if (!host.resetPoseBtn) return;
      const isBase = host.activePoseKey === "base";
      host.resetPoseBtn.disabled = isBase;
      host.renamePoseBtn.disabled = isBase;
      host.removePoseBtn.disabled = isBase;
      host.addPoseBtn.disabled =
            host.activeForm === "base" &&
            SUPPORTED_POSE_KEYS.every((key) => key in host._poseBank());
      host.poseImageInput.value = host._getPoseImagePath(
            host._currentConfig(),
            host.activePoseKey,
      );
      host._populateSpriteImageSelect(
            host.poseImageSelect,
            host.poseImageInput.value,
      );
}

export function _onPoseChanged(host: PosePanelHost) {
      host.mode = "default";
      host.cropDraft = null;
      host.hitboxDraft = null;
      host.hitboxDraftOffset = null;
      host.dragState = null;
      _updateCropButtons(host);
      host._updateHitboxButtons();
      host._syncHitboxControls(host._currentConfig());
      host._updatePoseActionButtons();
      const config = host._currentConfig();
      host._syncImageControls();
      host._refreshLabels();
      const imagePath = host._getPoseImagePath(config, host.activePoseKey);
      _loadBodyImage(host, imagePath, host.activePoseKey);
}

export function _updateCurrentPoseImage(host: PosePanelHost): void {
      const imagePath = host.poseImageInput.value.trim();
      const config = host._currentConfig();
      const previous = host._getPoseImagePath(config, host.activePoseKey);
      if (!imagePath) {
            host.poseImageInput.value = previous;
            return;
      }
      if (imagePath === previous) return;
      host._setPoseImagePath(config, host.activePoseKey, imagePath);
      host._populateSpriteImageSelect(host.poseImageSelect, imagePath);
      _loadBodyImage(host, imagePath, host.activePoseKey);
      host._saveState();
}

export function _syncImageControls(host: PosePanelHost) {
      const config = host._currentConfig();
      const visual = host._getPoseVisual(config, host.activePoseKey);
      host.controls.imageScale.value = visual.imageScale;
      host.controls.imageOffsetX.value = visual.imageOffset.x;
      host.controls.imageOffsetY.value = visual.imageOffset.y;
      _syncCropControls(host, { imageCrop: visual.imageCrop });
}

export function _refreshImageOutput(host: PosePanelHost): void {
      if (!host.imageOutput) return;
      const visual = host._getPoseVisual(
            host._currentConfig(),
            host.activePoseKey,
      );
      const values = [
            visual.imageScale ?? 1,
            visual.imageOffset?.x ?? 0,
            visual.imageOffset?.y ?? 0,
      ];
      if (visual.imageCrop)
            values.push(
                  visual.imageCrop.x,
                  visual.imageCrop.y,
                  visual.imageCrop.width,
                  visual.imageCrop.height,
            );
      host.imageOutput.value = values.join(" ");
}

export function _applyImageOutput(host: PosePanelHost): void {
      const config = host._currentConfig();
      const numbers =
            host.imageOutput.value.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      if (!numbers.length || numbers.some((value) => !Number.isFinite(value))) {
            host._refreshImageOutput();
            host._draw();
            return;
      }
      const patch: PosePatch = { imageScale: Math.max(0.1, numbers[0]) };
      if (numbers.length >= 3)
            patch.imageOffset = { x: numbers[1], y: numbers[2] };
      if (numbers.length >= 7)
            patch.imageCrop = {
                  x: Math.round(numbers[3]),
                  y: Math.round(numbers[4]),
                  width: Math.max(1, Math.round(numbers[5])),
                  height: Math.max(1, Math.round(numbers[6])),
            };
      host._setPoseVisual(config, host.activePoseKey, patch);
      if ("imageCrop" in patch) _clampCrop(host);
      host._syncImageControls();
      host._saveState();
      host._draw();
      host._syncImageControls();
      host._refreshLabels();
}
