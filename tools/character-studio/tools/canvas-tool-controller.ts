import type { AimTool } from "./aim/aim-tool";
import type { Vector2 } from "../../../src/types/fighter";
import type { MeleeSettings } from "../../../src/config/component-settings";
import {
      attackHitboxRect,
      movedAttackOffset,
} from "./attack-hitbox/attack-hitbox-geometry";
import {
      _getImageRect,
      _hitTestCropHandle,
      _previewRectToSourceCrop,
      _sourceCropToPreviewRect,
      _syncCropControls,
      type CropToolHost,
} from "./crop/crop-tool";
import {
      updateHitboxDrag,
      type HitboxToolHost,
} from "./body-hitbox/body-hitbox-tool";
import {
      getHitboxRect,
      hitTestCircleHandle,
      hitTestRectHandles,
} from "./body-hitbox/body-hitbox-geometry";
import type { DragState, Rect } from "../app/editor-types";

export type CanvasToolHost = CropToolHost &
      HitboxToolHost & {
            aimTool?: AimTool;
            dragState: DragState | null;
            _attackHitboxAction(): NonNullable<MeleeSettings["hitbox"]> | null;
            _syncAttackHitboxControls(): void;
      };

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): Vector2 {
      const rect = canvas.getBoundingClientRect();
      return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
}

export function installCanvasToolController(host: CanvasToolHost): void {
      host.canvas.addEventListener("pointerdown", (event) =>
            onPointerDown(host, event),
      );
      host.canvas.addEventListener("pointermove", (event) =>
            onPointerMove(host, event),
      );
      host.canvas.addEventListener("pointerup", (event) =>
            onPointerUp(host, event),
      );
      host.canvas.addEventListener("pointerleave", (event) =>
            onPointerUp(host, event),
      );
      host.canvas.addEventListener("pointercancel", (event) =>
            onPointerUp(host, event),
      );
}

function onPointerDown(host: CanvasToolHost, event: PointerEvent): void {
      if (host.aimTool?.onPointerDown(event)) return;
      const config = host._currentConfig();
      const point = canvasPoint(host.canvas, event);
      if (host.mode === "default") {
            const action = host._attackHitboxAction();
            if (!action) return;
            const rect = attackHitboxRect(
                  { x: host.canvas.width / 2, y: host.canvas.height / 2 },
                  action,
                  config.defaultFacing ?? "right",
            );
            if (
                  point.x < rect.x ||
                  point.x > rect.x + rect.width ||
                  point.y < rect.y ||
                  point.y > rect.y + rect.height
            )
                  return;
            host.canvas.setPointerCapture(event.pointerId);
            host.dragState = {
                  handle: "attack-move",
                  startX: point.x,
                  startY: point.y,
                  startRect: rect,
                  imageRect: rect,
                  startOffset: { ...action.offset },
            };
            return;
      }
      const rect =
            host.mode === "crop"
                  ? _sourceCropToPreviewRect(
                          host,
                          _getImageRect(host, config),
                          host.cropDraft ?? {
                                x: 0,
                                y: 0,
                                width: host.images.body.naturalWidth,
                                height: host.images.body.naturalHeight,
                          },
                          host.images.body,
                    )
                  : getHitboxRect(host, {
                          hitbox: host.hitboxDraft ?? config.hitbox,
                          hitboxOffset:
                                host.hitboxDraftOffset ?? config.hitboxOffset,
                    });
      const handle =
            host.mode === "crop"
                  ? _hitTestCropHandle(host, point.x, point.y, rect)
                  : host.hitboxDraft?.type === "box"
                    ? hitTestRectHandles(point.x, point.y, rect)
                    : hitTestCircleHandle(point.x, point.y, rect);
      if (!handle) return;
      host.canvas.setPointerCapture(event.pointerId);
      host.dragState = {
            handle,
            startX: point.x,
            startY: point.y,
            startRect: { ...rect },
            imageRect: _getImageRect(host, config),
            startOffset: {
                  ...(host.hitboxDraftOffset ??
                        config.hitboxOffset ?? { x: 0, y: 0 }),
            },
      };
}

function onPointerMove(host: CanvasToolHost, event: PointerEvent): void {
      if (host.aimTool?.onPointerMove(event)) return;
      if (!host.dragState) return;
      const point = canvasPoint(host.canvas, event);
      if (host.dragState.handle === "attack-move") {
            const action = host._attackHitboxAction();
            if (!action) return;
            action.offset = movedAttackOffset(
                  host.dragState.startOffset,
                  {
                        x: point.x - host.dragState.startX,
                        y: point.y - host.dragState.startY,
                  },
                  host._currentConfig().defaultFacing ?? "right",
            );
            host._syncAttackHitboxControls();
      } else if (host.mode === "hitbox") updateHitboxDrag(host, point);
      else if (host.mode === "crop") updateCropDrag(host, point);
      host._refreshLabels();
      host._draw();
}

function updateCropDrag(host: CanvasToolHost, point: Vector2): void {
      const drag = host.dragState;
      if (!drag) return;
      const deltaX = point.x - drag.startX;
      const deltaY = point.y - drag.startY;
      const handle = drag.handle;
      const rect: Rect = { ...drag.startRect };
      if (handle === "move") {
            rect.x += deltaX;
            rect.y += deltaY;
      } else {
            if (handle.includes("w")) {
                  rect.x += deltaX;
                  rect.width -= deltaX;
            }
            if (handle.includes("e")) rect.width += deltaX;
            if (handle.includes("n")) {
                  rect.y += deltaY;
                  rect.height -= deltaY;
            }
            if (handle.includes("s")) rect.height += deltaY;
      }
      const minSize = 8;
      if (rect.width < minSize) {
            if (handle.includes("w")) rect.x -= minSize - rect.width;
            rect.width = minSize;
      }
      if (rect.height < minSize) {
            if (handle.includes("n")) rect.y -= minSize - rect.height;
            rect.height = minSize;
      }
      const maxX = drag.imageRect.x + drag.imageRect.width;
      const maxY = drag.imageRect.y + drag.imageRect.height;
      rect.x = Math.max(drag.imageRect.x, Math.min(rect.x, maxX - rect.width));
      rect.y = Math.max(drag.imageRect.y, Math.min(rect.y, maxY - rect.height));
      rect.width = Math.max(minSize, Math.min(rect.width, maxX - rect.x));
      rect.height = Math.max(minSize, Math.min(rect.height, maxY - rect.y));
      host.cropDraft = _previewRectToSourceCrop(
            host,
            drag.imageRect,
            rect,
            host.images.body,
      );
      _syncCropControls(host, { imageCrop: host.cropDraft });
}

function onPointerUp(host: CanvasToolHost, event: PointerEvent): void {
      if (host.aimTool?.onPointerUp(event)) return;
      if (host.dragState?.handle === "attack-move") host._saveState();
      if (host.dragState && host.canvas.hasPointerCapture(event.pointerId))
            host.canvas.releasePointerCapture(event.pointerId);
      host.dragState = null;
}
