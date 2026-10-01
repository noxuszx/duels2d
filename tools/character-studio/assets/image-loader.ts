import type { StudioConfig } from "../app/editor-types";
import type { CropToolHost } from "../tools/crop/crop-tool";

export function _loadBodyImage(
      studio: CropToolHost,
      imagePath: string,
      poseKey: string,
): void {
      const requestToken = ++studio.pendingBodyImageRequest;
      const nextSrc = "../../" + imagePath;
      const previousSrc = studio.images.body.getAttribute("src");
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
      // A loaded asset changes the preview, not the authored document.
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
