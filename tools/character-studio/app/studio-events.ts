import { installPreviewAnimation } from "../preview/preview-animation";
import type { Facing } from "../../../src/types/fighter";
import type { ControlName } from "./editor-types";
import { requireElement } from "../ui/dom";
import { installCanvasToolController } from "../tools/canvas-tool-controller";
import type { CharacterStudio } from "./studio-app";

/** Connects browser events to editor actions; contains no document model. */
export function installStudioEvents(studio: CharacterStudio): void {
      studio.configs.forEach((cfg, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = cfg.name;
            studio.select.appendChild(option);
      });

      studio.select.addEventListener("change", () => {
            studio.activeConfigIndex = Number.parseInt(studio.select.value, 10);
            studio._loadCurrentConfig();
      });

      studio.poseSelect.addEventListener("change", () => {
            studio.formTool.stopPreview();
            studio.activePoseKey = studio.poseSelect.value;
            studio._onPoseChanged();
      });

      studio.poseImageInput.addEventListener("change", () =>
            studio._updateCurrentPoseImage(),
      );
      studio.poseImageSelect.addEventListener("change", () => {
            if (!studio.poseImageSelect.value) return;
            studio.poseImageInput.value = studio.poseImageSelect.value;
            studio._updateCurrentPoseImage();
      });
      studio.poseImageInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            studio._updateCurrentPoseImage();
            studio.poseImageInput.select();
      });
      studio.addPoseBtn.addEventListener("click", () =>
            studio._openPoseDialog("add"),
      );
      studio.renamePoseBtn.addEventListener("click", () =>
            studio._openPoseDialog("rename"),
      );
      studio.removePoseBtn.addEventListener("click", () =>
            studio._removeCurrentPose(),
      );
      studio.poseDialogForm.addEventListener("submit", (event) => {
            event.preventDefault();
            studio._commitPoseDialog();
      });
      studio.poseDialogImageSelect.addEventListener("change", () => {
            if (studio.poseDialogImageSelect.value) {
                  studio.poseDialogImage.value =
                        studio.poseDialogImageSelect.value;
            }
      });
      ["pose-dialog-close", "pose-dialog-cancel"].forEach((id) => {
            requireElement<HTMLButtonElement>(id).addEventListener(
                  "click",
                  () => studio.poseDialog.close(),
            );
      });

      studio.resetPoseBtn.addEventListener("click", () =>
            studio._resetCurrentPose(),
      );
      studio.imageOutput.addEventListener("change", () =>
            studio._applyImageOutput(),
      );
      studio.imageOutput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            studio._applyImageOutput();
            studio.imageOutput.select();
      });
      studio.imageOutput.addEventListener("paste", () => {
            setTimeout(() => studio._applyImageOutput(), 0);
      });

      studio.hitboxType.addEventListener("change", () => {
            if (studio.isRestoring) return;
            studio._updateConfigFromInputs("hitboxType");
            studio._syncHitboxControlState();
            studio._draw();
            studio._saveState();
      });

      (Object.keys(studio.controls) as ControlName[]).forEach((key) => {
            studio.controls[key].addEventListener("input", () => {
                  if (studio.isRestoring) return;
                  studio._updateConfigFromInputs(key);
                  studio._draw();
            });

            studio.controls[key].addEventListener("change", () => {
                  if (studio.isRestoring) return;
                  if (studio.mode === "crop" && key.startsWith("imageCrop"))
                        return;
                  if (studio.mode === "hitbox" && key.startsWith("hitbox"))
                        return;
                  studio._saveState();
            });
      });

      window.addEventListener("keydown", (event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const target = event.target;
            if (
                  target instanceof HTMLElement &&
                  (target.isContentEditable ||
                        target.matches("textarea, input:not([type=range])"))
            )
                  return;

            if (event.key === "z" && !event.shiftKey) {
                  event.preventDefault();
                  studio.undo();
            } else if (
                  event.key === "y" ||
                  (event.key === "Z" && event.shiftKey)
            ) {
                  event.preventDefault();
                  studio.redo();
            }
      });

      studio.defaultFacingSelect.addEventListener("change", () => {
            const config = studio._currentConfig();
            config.defaultFacing = studio.defaultFacingSelect.value as Facing;
            studio._draw();
            studio._saveState();
      });

      studio.meleeComponentSelect.addEventListener("change", () => {
            studio._syncAttackHitboxControls();
            studio._draw();
      });

      studio.projectileImageSelect.addEventListener("change", () => {
            studio._loadProjectilePreview();
            studio._syncProjectileControls();
            studio._draw();
      });
      [studio.projectileImageScale, studio.projectileRotationSpeed].forEach(
            (input) => {
                  input.addEventListener("input", () => {
                        if (studio.isRestoring) return;
                        studio._updateProjectileConfig();
                        studio._draw();
                  });
                  input.addEventListener("change", () => {
                        if (!studio.isRestoring) studio._saveState();
                  });
            },
      );

      const updateWeaponImage = () => {
            const config = studio._currentConfig();
            config.weaponIdle = studio.weaponImagePath.value.trim() || null;
            studio.images.weaponIdle.src = config.weaponIdle
                  ? "../../" + config.weaponIdle
                  : "";
            studio._draw();
            studio._saveState();
      };
      studio.weaponImagePath.addEventListener("change", updateWeaponImage);
      studio.weaponImagePath.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            updateWeaponImage();
      });

      studio.saveBtn.addEventListener("click", async () => {
            const config = studio._currentConfig();
            if (!studio.fileHandles.has(config.id)) {
                  // The File System Access API is not available in every browser or
                  // when the page is opened directly from file://. Fall back to a
                  // regular download so Save still has a useful result in those cases.
                  if (typeof window.showSaveFilePicker !== "function") {
                        studio._downloadLocalFile(config);
                        return;
                  }

                  try {
                        const fileHandle = await window.showSaveFilePicker({
                              suggestedName: `${config.id}.json`,
                              types: [
                                    {
                                          description: "JSON Files",
                                          accept: {
                                                "application/json": [".json"],
                                          },
                                    },
                              ],
                        });
                        studio.fileHandles.set(config.id, fileHandle);
                        studio._updateSaveButton();
                  } catch (error: unknown) {
                        // Closing the picker is an intentional cancellation, not a save
                        // failure. Other picker errors can still use the download fallback
                        // (for example, browsers that expose but do not implement it).
                        if (!(
                              error instanceof DOMException &&
                              error.name === "AbortError"
                        )) {
                              console.warn(
                                    "File picker unavailable; downloading instead:",
                                    error,
                              );
                              studio._downloadLocalFile(config);
                        }
                        return;
                  }
            }

            void studio._saveToLocalFile(config);
      });

      studio.cropBtn.addEventListener("click", () => studio._enterCropMode());
      studio.applyCropBtn.addEventListener("click", () => studio._applyCrop());
      studio.cancelCropBtn.addEventListener("click", () =>
            studio._cancelCrop(),
      );
      studio.editHitboxBtn.addEventListener("click", () =>
            studio._enterHitboxMode(),
      );
      studio.applyHitboxBtn.addEventListener("click", () =>
            studio._applyHitbox(),
      );
      studio.cancelHitboxBtn.addEventListener("click", () =>
            studio._cancelHitbox(),
      );

      installCanvasToolController(studio);
      studio.hitboxOutput.addEventListener("change", () =>
            studio._applyHitboxOutput(),
      );

      studio.images.weaponIdle.onload = () => studio._draw();
      studio.images.weaponAttack.onload = () => studio._draw();
      studio.images.projectile.onload = () => studio._draw();

      installPreviewAnimation(studio);
}
