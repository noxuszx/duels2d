import type { ImageCrop } from "../types/fighter";

export type SpriteDrawRect = {
      dx: number;
      dy: number;
      dw: number;
      dh: number;
};

/** Fits a sprite inside a square diameter without changing its aspect ratio. */
export function getAspectFitSpriteRect(
      naturalWidth: number,
      naturalHeight: number,
      drawRadius: number,
): SpriteDrawRect {
      const safeWidth = Math.max(1, naturalWidth);
      const safeHeight = Math.max(1, naturalHeight);
      const scale = (drawRadius * 2) / Math.max(safeWidth, safeHeight);
      const width = safeWidth * scale;
      const height = safeHeight * scale;
      return {
            dx: -width / 2,
            dy: -height / 2,
            dw: width,
            dh: height,
      };
}

/** Maps a source crop into the aspect-fitted sprite rectangle. */
export function getAspectFitCropDrawRect(
      naturalWidth: number,
      naturalHeight: number,
      crop: ImageCrop,
      drawRadius: number,
): SpriteDrawRect {
      const fitted = getAspectFitSpriteRect(
            naturalWidth,
            naturalHeight,
            drawRadius,
      );
      const scale = fitted.dw / Math.max(1, naturalWidth);
      return {
            dx: fitted.dx + crop.x * scale,
            dy: fitted.dy + crop.y * scale,
            dw: crop.width * scale,
            dh: crop.height * scale,
      };
}

