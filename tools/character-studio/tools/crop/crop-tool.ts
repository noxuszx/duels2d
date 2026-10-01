import type { ImageCrop } from "../../../../src/types/fighter";
export * from "./crop-geometry";
import { _normalizeCropBounds } from "./crop-geometry";
export {
      _loadBodyImage,
      _onBodyImageLoaded,
      _updateCropRanges,
} from "../../assets/image-loader";
import type {
      DragState,
      NumericInput,
      PoseVisual,
      StudioConfig,
} from "../../app/editor-types";

export interface CropToolHost {
      canvas: HTMLCanvasElement;
      activePoseKey: string;
      pendingBodyImageRequest: number;
      mode: "default" | "crop" | "hitbox";
      cropDraft: ImageCrop | null;
      dragState: DragState | null;
      images: { body: HTMLImageElement };
      controls: Pick<
            Record<
                  | "imageCropX"
                  | "imageCropY"
                  | "imageCropWidth"
                  | "imageCropHeight",
                  NumericInput
            >,
            "imageCropX" | "imageCropY" | "imageCropWidth" | "imageCropHeight"
      >;
      applyCropBtn: HTMLButtonElement;
      cancelCropBtn: HTMLButtonElement;
      _currentConfig(): StudioConfig;
      _getPoseVisual(config: StudioConfig, poseKey: string): PoseVisual;
      _setPoseVisual(
            config: StudioConfig,
            poseKey: string,
            patch: Partial<PoseVisual>,
      ): void;
      _ensureConfigShape(config: StudioConfig): void;
      _syncImageControls(): void;
      _refreshLabels(): void;
      _saveState(): void;
      _draw(): void;
      _cancelHitbox?(): void;
}

export function _clampCrop(studio: CropToolHost) {
      const config = studio._currentConfig();
      const img = studio.images.body;
      const visual = studio._getPoseVisual(config, studio.activePoseKey);
      const crop = visual.imageCrop;
      if (!crop) return;
      const nw = img.complete ? img.naturalWidth : Infinity;
      const nh = img.complete ? img.naturalHeight : Infinity;
      const clamped = {
            x: Math.max(0, Math.min(crop.x, nw - 1)),
            y: Math.max(0, Math.min(crop.y, nh - 1)),
            width: Math.max(
                  1,
                  Math.min(
                        crop.width,
                        nw - Math.max(0, Math.min(crop.x, nw - 1)),
                  ),
            ),
            height: Math.max(
                  1,
                  Math.min(
                        crop.height,
                        nh - Math.max(0, Math.min(crop.y, nh - 1)),
                  ),
            ),
      };
      // Write clamped crop back
      studio._setPoseVisual(config, studio.activePoseKey, {
            imageCrop: clamped,
      });
}

export function _syncCropControls(
      studio: CropToolHost,
      config: Pick<PoseVisual, "imageCrop">,
): void {
      // Accept either a config object or a plain {imageCrop} wrapper
      const crop =
            config.imageCrop ??
            (studio.images.body.complete && studio.images.body.naturalWidth > 0
                  ? {
                          x: 0,
                          y: 0,
                          width: studio.images.body.naturalWidth,
                          height: studio.images.body.naturalHeight,
                    }
                  : null);
      if (!crop) return;
      studio.controls.imageCropX.value = crop.x;
      studio.controls.imageCropY.value = crop.y;
      studio.controls.imageCropWidth.value = crop.width;
      studio.controls.imageCropHeight.value = crop.height;
}

export function _updateCropButtons(studio: CropToolHost) {
      const active = studio.mode === "crop";
      studio.applyCropBtn.disabled = !active || !studio.cropDraft;
      studio.cancelCropBtn.disabled = !active;
}

export function _enterCropMode(studio: CropToolHost) {
      const config = studio._currentConfig();
      studio._ensureConfigShape(config);
      if (!studio.images.body.complete || studio.images.body.naturalWidth === 0)
            return;

      if (studio.mode === "hitbox") studio._cancelHitbox?.();
      const visual = studio._getPoseVisual(config, studio.activePoseKey);
      studio.cropDraft = visual.imageCrop
            ? { ...visual.imageCrop }
            : {
                    x: 0,
                    y: 0,
                    width: studio.images.body.naturalWidth,
                    height: studio.images.body.naturalHeight,
              };
      _syncCropControls(studio, { imageCrop: studio.cropDraft });
      studio.mode = "crop";
      studio.dragState = null;
      _updateCropButtons(studio);
      studio._draw();
}

export function _applyCrop(studio: CropToolHost) {
      if (!studio.cropDraft) return;
      const config = studio._currentConfig();
      studio._setPoseVisual(config, studio.activePoseKey, {
            imageCrop: _normalizeCropBounds(
                  studio,
                  studio.cropDraft,
                  studio.images.body,
            ),
      });
      const visual = studio._getPoseVisual(config, studio.activePoseKey);
      _syncCropControls(studio, { imageCrop: visual.imageCrop });
      studio._refreshLabels();
      studio._saveState();
      studio.mode = "default";
      studio.dragState = null;
      studio.cropDraft = null;
      _updateCropButtons(studio);
      studio._draw();
}

export function _cancelCrop(studio: CropToolHost) {
      studio._syncImageControls();
      _syncCropControls(
            studio,
            studio._getPoseVisual(
                  studio._currentConfig(),
                  studio.activePoseKey,
            ),
      );
      studio._refreshLabels();
      studio.mode = "default";
      studio.dragState = null;
      studio.cropDraft = null;
      _updateCropButtons(studio);
      studio._draw();
}
