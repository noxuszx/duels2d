import type { StudioConfig } from "../app/editor-types";
import { SUPPORTED_POSE_KEYS } from "../document/pose-model";
import { ensurePoseBank } from "../document/form-model";
import { poseLabel } from "../document/pose-label";
import { requireElement } from "../ui/dom";
import type { PosePanelHost } from "./pose-panel";

export interface PoseDialogHost extends PosePanelHost {
      poseDialogMode: "add" | "rename";
      poseDialog: HTMLDialogElement;
      poseDialogTitle: HTMLElement;
      poseDialogKey: HTMLSelectElement;
      poseDialogImageSelect: HTMLSelectElement;
      poseDialogImage: HTMLInputElement;
      poseDialogError: HTMLElement;
      transformationTool: { sync(): void };
      _populatePoseSelect(config: StudioConfig): void;
      _onPoseChanged(): void;
}

export function _openPoseDialog(
      host: PoseDialogHost,
      mode: "add" | "rename",
): void {
      if (mode === "rename" && host.activePoseKey === "base") return;
      const poses = host._poseBank();
      const availableKeys = SUPPORTED_POSE_KEYS.filter(
            (key) =>
                  !(key in poses) ||
                  (mode === "rename" && key === host.activePoseKey),
      );
      if (availableKeys.length === 0 && host.activeForm === "base") return;

      host.poseDialogMode = mode;
      host.poseDialogTitle.textContent =
            mode === "add" ? "Add Sprite" : "Rename Sprite";
      host.poseDialogKey.replaceChildren();
      requireElement<HTMLInputElement>("pose-dialog-custom-key").hidden =
            host.activeForm !== "transformed";
      requireElement<HTMLInputElement>("pose-dialog-custom-key").value = "";
      availableKeys.forEach((key) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = poseLabel(key);
            host.poseDialogKey.appendChild(option);
      });
      const selectedImagePath =
            mode === "rename"
                  ? host._getPoseImagePath(
                        host._currentConfig(),
                        host.activePoseKey,
                  )
                  : "";
      host._populateSpriteImageSelect(
            host.poseDialogImageSelect,
            selectedImagePath,
      );
      if (mode === "rename") {
            host.poseDialogKey.value = host.activePoseKey;
            if (
                  host.activeForm === "transformed" &&
                  !SUPPORTED_POSE_KEYS.includes(
                        host.activePoseKey as (typeof SUPPORTED_POSE_KEYS)[number],
                  )
            ) {
                  requireElement<HTMLInputElement>(
                        "pose-dialog-custom-key",
                  ).value = host.activePoseKey;
            }
            host.poseDialogImage.value = selectedImagePath;
      } else {
            host.poseDialogImage.value = "";
      }
      host.poseDialogError.textContent = "";
      host.poseDialog.showModal();
      queueMicrotask(() =>
            mode === "add"
                  ? host.poseDialogImage.focus()
                  : host.poseDialogKey.focus(),
      );
}

export function _commitPoseDialog(host: PoseDialogHost): void {
      const customKey = requireElement<HTMLInputElement>(
            "pose-dialog-custom-key",
      ).value.trim();
      const nextKey =
            host.activeForm === "transformed" && customKey
                  ? customKey
                  : host.poseDialogKey.value;
      const imagePath = host.poseDialogImage.value.trim();
      if (
            !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(nextKey) ||
            ["base", "constructor", "prototype"].includes(nextKey) ||
            (host.activeForm === "base" &&
                  !SUPPORTED_POSE_KEYS.includes(
                        nextKey as (typeof SUPPORTED_POSE_KEYS)[number],
                  ))
      ) {
            host.poseDialogError.textContent = "Choose a supported game pose.";
            return;
      }
      if (!imagePath) {
            host.poseDialogError.textContent = "Enter the sprite image path.";
            host.poseDialogImage.focus();
            return;
      }

      const config = host._currentConfig();
      const poses = ensurePoseBank(config, host.activeForm);
      const oldKey = host.activePoseKey;
      if (
            nextKey in poses &&
            !(host.poseDialogMode === "rename" && nextKey === oldKey)
      ) {
            host.poseDialogError.textContent = `${poseLabel(nextKey)} already has a sprite.`;
            return;
      }

      if (host.poseDialogMode === "add") {
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
            if (host.activeForm === "transformed") {
                  config.transformation?.sequence?.forEach((step) => {
                        if (step.pose === oldKey) step.pose = nextKey;
                  });
            }
      }

      host.activePoseKey = nextKey;
      host._populatePoseSelect(config);
      host._onPoseChanged();
      host._saveState();
      host.poseDialog.close();
      host.transformationTool.sync();
}

export function _removeCurrentPose(host: PoseDialogHost): void {
      if (host.activePoseKey === "base") return;
      const label = poseLabel(host.activePoseKey);
      if (
            !window.confirm(
                  `Remove the ${label} sprite? You can undo this change.`,
            )
      ) {
            return;
      }
      const config = host._currentConfig();
      const poses = ensurePoseBank(config, host.activeForm);
      if (!poses[host.activePoseKey]) return;
      delete poses[host.activePoseKey];
      if (host.activeForm === "transformed" && config.transformation) {
            config.transformation.sequence =
                  config.transformation.sequence?.filter(
                        (step) => step.pose !== host.activePoseKey,
                  );
      }
      host.activePoseKey = "base";
      host._populatePoseSelect(config);
      host._onPoseChanged();
      host._saveState();
      host.transformationTool.sync();
}

export function _resetCurrentPose(host: PoseDialogHost) {
      if (host.activePoseKey === "base") return;
      const config = host._currentConfig();
      const poseVal = host._poseBank(config)[host.activePoseKey];
      if (!poseVal) return;
      const imagePath = host._getPoseImagePath(config, host.activePoseKey);
      ensurePoseBank(config, host.activeForm)[host.activePoseKey] = {
            image: imagePath,
            imageScale: config.imageScale,
            imageOffset: { ...config.imageOffset },
            imageCrop: config.imageCrop ? { ...config.imageCrop } : null,
      };
      host._syncImageControls();
      host._refreshLabels();
      host._saveState();
      host._draw();
}
