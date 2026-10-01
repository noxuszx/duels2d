import type { ImageCrop } from "../../../../src/types/fighter";
import {
      getAspectFitCropDrawRect,
      getAspectFitSpriteRect,
} from "../../../../src/rendering/sprite-geometry";
import type { Rect, StudioConfig } from "../../app/editor-types";
import type { CropToolHost } from "./crop-tool";

export type CropGeometryHost = Pick<
      CropToolHost,
      "canvas" | "activePoseKey" | "images" | "_getPoseVisual"
>;

export function _getCropDrawRect(
      studio: CropGeometryHost,
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

export function _getImageRect(
      studio: CropGeometryHost,
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
      studio: CropGeometryHost,
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
      studio: CropGeometryHost,
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
      studio: CropGeometryHost,
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
      studio: CropGeometryHost,
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
      studio: CropGeometryHost,
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
