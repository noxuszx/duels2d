import type { ImageCrop } from "../../src/types/fighter";
import {
      getAspectFitCropDrawRect,
      getAspectFitSpriteRect,
} from "../../src/rendering/sprite-geometry";
import type {
      DragState,
      NumericInput,
      PoseVisual,
      Rect,
      StudioConfig,
} from "./studio-types";

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
}

export function _initCropFromImage(
      studio: CropToolHost,
      config: StudioConfig,
): void {
      if (config.imageCrop) return;
      const img = studio.images.body;
      if (img.complete && img.naturalWidth > 0) {
            config.imageCrop = {
                  x: 0,
                  y: 0,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
            };
      }
}

export function _initPoseCropFromImage(
      studio: CropToolHost,
      config: StudioConfig,
      poseKey: string,
): void {
      if (poseKey === "base") {
            _initCropFromImage(studio, config);
            return;
      }
      const poseVal = config.poses?.[poseKey];
      const poseObj = poseVal && typeof poseVal === "object" ? poseVal : null;
      if (poseObj?.imageCrop) return;
      const img = studio.images.body;
      if (img.complete && img.naturalWidth > 0) {
            studio._setPoseVisual(config, poseKey, {
                  imageCrop: {
                        x: 0,
                        y: 0,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                  },
            });
      }
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

export function _loadBodyImage(
      studio: CropToolHost,
      imagePath: string,
      poseKey: string,
): void {
      const requestToken = ++studio.pendingBodyImageRequest;
      const nextSrc = "../../" + imagePath;
      const previousSrc = studio.images.body.src;
      studio.images.body.onload = () => {
            if (requestToken !== studio.pendingBodyImageRequest) return;
            _onBodyImageLoaded(studio, studio._currentConfig(), poseKey);
      };
      studio.images.body.src = nextSrc;
      if (
            previousSrc === nextSrc &&
            studio.images.body.complete &&
            studio.images.body.naturalWidth > 0
      ) {
            _onBodyImageLoaded(studio, studio._currentConfig(), poseKey);
      }
}

export function _onBodyImageLoaded(
      studio: CropToolHost,
      config: StudioConfig,
      poseKey: string,
): void {
      if (poseKey === "base") {
            _initCropFromImage(studio, config);
      } else {
            _initPoseCropFromImage(studio, config, poseKey);
      }
      if (poseKey === studio.activePoseKey) {
            _updateCropRanges(studio);
            studio._syncImageControls();
            studio._refreshLabels();
            studio._draw();
      }
}

export function _updateCropRanges(studio: CropToolHost) {
      const img = studio.images.body;
      if (!img.complete || img.naturalWidth === 0) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      studio.controls.imageCropX.max = String(nw - 1);
      studio.controls.imageCropY.max = String(nh - 1);
      studio.controls.imageCropWidth.max = String(nw);
      studio.controls.imageCropHeight.max = String(nh);
}

export function _getCropDrawRect(
      studio: CropToolHost,
      image: HTMLImageElement,
      crop: ImageCrop | null,
      drawRadius: number,
): { dx: number; dy: number; dw: number; dh: number; crop: ImageCrop } {
      const safeCrop = crop ?? {
            x: 0,
            y: 0,
            width: image.naturalWidth,
            height: image.naturalHeight,
      };
      return {
            ...getAspectFitCropDrawRect(
                  image.naturalWidth,
                  image.naturalHeight,
                  safeCrop,
                  drawRadius,
            ),
            crop: safeCrop,
      };
}

export function _syncCropControls(
      studio: CropToolHost,
      config: Pick<PoseVisual, "imageCrop">,
): void {
      // Accept either a config object or a plain {imageCrop} wrapper
      const crop = config.imageCrop;
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

      const visual = studio._getPoseVisual(config, studio.activePoseKey);
      studio.cropDraft = visual.imageCrop
            ? { ...visual.imageCrop }
            : {
                    x: 0,
                    y: 0,
                    width: studio.images.body.naturalWidth,
                    height: studio.images.body.naturalHeight,
              };
      studio.mode = "crop";
      studio.dragState = null;
      _updateCropButtons(studio);
      studio._draw();
}

export function _applyCrop(studio: CropToolHost) {
      if (!studio.cropDraft) return;
      const config = studio._currentConfig();
      studio._setPoseVisual(config, studio.activePoseKey, {
            imageCrop: { ...studio.cropDraft },
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
      studio.mode = "default";
      studio.dragState = null;
      studio.cropDraft = null;
      _updateCropButtons(studio);
      studio._draw();
}

export function _getImageRect(
      studio: CropToolHost,
      config: StudioConfig,
): Rect {
      const centerX = studio.canvas.width / 2;
      const centerY = studio.canvas.height / 2;
      const radius = config.radius ?? 30;
      const visual = studio._getPoseVisual(config, studio.activePoseKey);
      const drawR = radius * visual.imageScale;
      const fitted = getAspectFitSpriteRect(
            studio.images.body.naturalWidth,
            studio.images.body.naturalHeight,
            drawR,
      );
      return {
            x: centerX + visual.imageOffset.x + fitted.dx,
            y: centerY + visual.imageOffset.y + fitted.dy,
            width: fitted.dw,
            height: fitted.dh,
      };
}

export function _sourceCropToPreviewRect(
      studio: CropToolHost,
      imageRect: Rect,
      crop: ImageCrop,
      image: HTMLImageElement,
): Rect {
      return {
            x: imageRect.x + (crop.x / image.naturalWidth) * imageRect.width,
            y: imageRect.y + (crop.y / image.naturalHeight) * imageRect.height,
            width: (crop.width / image.naturalWidth) * imageRect.width,
            height: (crop.height / image.naturalHeight) * imageRect.height,
      };
}

export function _previewRectToSourceCrop(
      studio: CropToolHost,
      imageRect: Rect,
      rect: Rect,
      image: HTMLImageElement,
): ImageCrop {
      const x = ((rect.x - imageRect.x) / imageRect.width) * image.naturalWidth;
      const y =
            ((rect.y - imageRect.y) / imageRect.height) * image.naturalHeight;
      const width = (rect.width / imageRect.width) * image.naturalWidth;
      const height = (rect.height / imageRect.height) * image.naturalHeight;
      return _normalizeCropBounds(studio, { x, y, width, height }, image);
}

export function _normalizeCropBounds(
      studio: CropToolHost,
      crop: ImageCrop,
      image: HTMLImageElement,
): ImageCrop {
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

export function _pointInRect(
      studio: CropToolHost,
      px: number,
      py: number,
      rect: Rect,
): boolean {
      return (
            px >= rect.x &&
            px <= rect.x + rect.width &&
            py >= rect.y &&
            py <= rect.y + rect.height
      );
}

export function _hitTestCropHandle(
      studio: CropToolHost,
      px: number,
      py: number,
      rect: Rect,
): string | null {
      const size = 12;
      const half = size / 2;
      const handles: Array<[string, number, number]> = [
            ["nw", rect.x, rect.y],
            ["n", rect.x + rect.width / 2, rect.y],
            ["ne", rect.x + rect.width, rect.y],
            ["w", rect.x, rect.y + rect.height / 2],
            ["move", rect.x + rect.width / 2, rect.y + rect.height / 2],
            ["e", rect.x + rect.width, rect.y + rect.height / 2],
            ["sw", rect.x, rect.y + rect.height],
            ["s", rect.x + rect.width / 2, rect.y + rect.height],
            ["se", rect.x + rect.width, rect.y + rect.height],
      ];
      for (const [name, x, y] of handles) {
            if (Math.abs(px - x) <= half && Math.abs(py - y) <= half)
                  return name;
      }
      return _pointInRect(studio, px, py, rect) ? "move" : null;
}
