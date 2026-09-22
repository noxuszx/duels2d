import type { CharacterStudio } from "./studio-app";
import type { StudioConfig, StudioTextStyle } from "./studio-types";
import {
      _clampCrop,
      _getCropDrawRect,
      _getImageRect,
      _sourceCropToPreviewRect,
} from "./crop-tool";

function drawHitboxOutline(
      studio: CharacterStudio,
      config: StudioConfig,
      centerX: number,
      centerY: number,
): void {
      const hitbox =
            studio.mode === "hitbox" && studio.hitboxDraft
                  ? studio.hitboxDraft
                  : config.hitbox;
      const offset =
            studio.mode === "hitbox" && studio.hitboxDraftOffset
                  ? studio.hitboxDraftOffset
                  : (config.hitboxOffset ?? { x: 0, y: 0 });
      const hitCenterX = centerX + offset.x;
      const hitCenterY = centerY + offset.y;
      studio.ctx.save();
      studio.ctx.strokeStyle =
            studio.mode === "hitbox" ? "#ffb000" : "rgba(255, 0, 0, 0.75)";
      studio.ctx.lineWidth = 2;
      studio.ctx.setLineDash([8, 6]);

      if (hitbox.type === "box") {
            const width = hitbox.width;
            const height = hitbox.height;
            studio.ctx.strokeRect(
                  hitCenterX - width / 2,
                  hitCenterY - height / 2,
                  width,
                  height,
            );
      } else {
            studio.ctx.beginPath();
            studio.ctx.arc(
                  hitCenterX,
                  hitCenterY,
                  hitbox.radius,
                  0,
                  Math.PI * 2,
            );
            studio.ctx.stroke();
      }

      studio.ctx.restore();
}

function drawHitboxEditOverlay(
      studio: CharacterStudio,
      config: StudioConfig,
      centerX: number,
      centerY: number,
): void {
      if (studio.mode !== "hitbox" || !studio.hitboxDraft) return;
      const offset = studio.hitboxDraftOffset ??
            config.hitboxOffset ?? { x: 0, y: 0 };
      const rect = studio._getHitboxRect({
            hitbox: studio.hitboxDraft,
            hitboxOffset: offset,
      });
      const cx = centerX + offset.x;
      const cy = centerY + offset.y;
      const safety = studio._getSafetyRect(config);
      studio.ctx.save();
      studio.ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      studio.ctx.beginPath();
      studio.ctx.rect(0, 0, studio.canvas.width, studio.canvas.height);
      studio.ctx.rect(safety.x, safety.y, safety.width, safety.height);
      if (studio.hitboxDraft.type === "box") {
            studio.ctx.rect(rect.x, rect.y, rect.width, rect.height);
      } else {
            studio.ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
      }
      studio.ctx.fill("evenodd");
      studio.ctx.strokeStyle = "rgba(212, 160, 0, 0.35)";
      studio.ctx.setLineDash([4, 4]);
      studio.ctx.strokeRect(safety.x, safety.y, safety.width, safety.height);
      studio.ctx.strokeStyle = "#ffb000";
      studio.ctx.lineWidth = 2;
      if (studio.hitboxDraft.type === "box") {
            studio.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            const pts = [
                  [rect.x, rect.y],
                  [rect.x + rect.width / 2, rect.y],
                  [rect.x + rect.width, rect.y],
                  [rect.x, rect.y + rect.height / 2],
                  [rect.x + rect.width, rect.y + rect.height / 2],
                  [rect.x, rect.y + rect.height],
                  [rect.x + rect.width / 2, rect.y + rect.height],
                  [rect.x + rect.width, rect.y + rect.height],
            ];
            studio.ctx.fillStyle = "#fff";
            for (const [x, y] of pts) studio.ctx.fillRect(x - 4, y - 4, 8, 8);
            studio.ctx.strokeStyle = "#ffb000";
            for (const [x, y] of pts) studio.ctx.strokeRect(x - 4, y - 4, 8, 8);
      } else {
            studio.ctx.beginPath();
            studio.ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
            studio.ctx.stroke();
            studio.ctx.beginPath();
            studio.ctx.arc(cx + rect.width / 2, cy, 4, 0, Math.PI * 2);
            studio.ctx.fillStyle = "#fff";
            studio.ctx.fill();
            studio.ctx.stroke();
      }
      studio.ctx.restore();
}

function tracePlusPath(
      studio: CharacterStudio,
      x: number,
      y: number,
      size: number,
): void {
      const unit = size / 3;
      studio.ctx.beginPath();
      studio.ctx.moveTo(x + unit, y);
      studio.ctx.lineTo(x + unit * 2, y);
      studio.ctx.lineTo(x + unit * 2, y + unit);
      studio.ctx.lineTo(x + size, y + unit);
      studio.ctx.lineTo(x + size, y + unit * 2);
      studio.ctx.lineTo(x + unit * 2, y + unit * 2);
      studio.ctx.lineTo(x + unit * 2, y + size);
      studio.ctx.lineTo(x + unit, y + size);
      studio.ctx.lineTo(x + unit, y + unit * 2);
      studio.ctx.lineTo(x, y + unit * 2);
      studio.ctx.lineTo(x, y + unit);
      studio.ctx.lineTo(x + unit, y + unit);
      studio.ctx.closePath();
}

export function drawStudio(studio: CharacterStudio): void {
      const ctx = studio.ctx;
      const config = studio._currentConfig();
      studio._ensureConfigShape(config);

      ctx.clearRect(0, 0, studio.canvas.width, studio.canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, studio.canvas.width, studio.canvas.height);

      const centerX = studio.canvas.width / 2;
      const centerY = studio.canvas.height / 2;
      const radius = config.radius ?? 30;
      const imageRect =
            studio.images.body.complete && studio.images.body.naturalWidth > 0
                  ? _getImageRect(studio, config)
                  : null;

      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, studio.canvas.height);
      ctx.moveTo(0, centerY);
      ctx.lineTo(studio.canvas.width, centerY);
      ctx.stroke();

      drawHitboxOutline(studio, config, centerX, centerY);

      if (studio.images.body.complete && studio.images.body.naturalWidth > 0) {
            _clampCrop(studio);
            const visual = studio._getPoseVisual(config, studio.activePoseKey);
            const drawRadius = radius * visual.imageScale;
            const { crop, dx, dy, dw, dh } = _getCropDrawRect(
                  studio,
                  studio.images.body,
                  visual.imageCrop,
                  drawRadius,
            );

            const studioFlip = config.defaultFacing === "left" ? -1 : 1;
            ctx.save();
            ctx.translate(
                  centerX + visual.imageOffset.x,
                  centerY + visual.imageOffset.y,
            );
            ctx.scale(studioFlip, 1);
            ctx.drawImage(
                  studio.images.body,
                  crop.x,
                  crop.y,
                  crop.width,
                  crop.height,
                  dx,
                  dy,
                  dw,
                  dh,
            );
            ctx.restore();

            if (studio.mode === "crop" && studio.cropDraft && imageRect) {
                  const cropRect = _sourceCropToPreviewRect(
                        studio,
                        imageRect,
                        studio.cropDraft,
                        studio.images.body,
                  );

                  ctx.save();
                  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                  ctx.beginPath();
                  ctx.rect(0, 0, studio.canvas.width, studio.canvas.height);
                  ctx.rect(
                        cropRect.x,
                        cropRect.y,
                        cropRect.width,
                        cropRect.height,
                  );
                  ctx.fill("evenodd");

                  ctx.strokeStyle = "#d4a000";
                  ctx.lineWidth = 2;
                  ctx.strokeRect(
                        cropRect.x,
                        cropRect.y,
                        cropRect.width,
                        cropRect.height,
                  );

                  const handleSize = 8;
                  const points = [
                        [cropRect.x, cropRect.y],
                        [cropRect.x + cropRect.width / 2, cropRect.y],
                        [cropRect.x + cropRect.width, cropRect.y],
                        [cropRect.x, cropRect.y + cropRect.height / 2],
                        [
                              cropRect.x + cropRect.width,
                              cropRect.y + cropRect.height / 2,
                        ],
                        [cropRect.x, cropRect.y + cropRect.height],
                        [
                              cropRect.x + cropRect.width / 2,
                              cropRect.y + cropRect.height,
                        ],
                        [
                              cropRect.x + cropRect.width,
                              cropRect.y + cropRect.height,
                        ],
                  ];
                  ctx.fillStyle = "#fff";
                  for (const [x, y] of points) {
                        ctx.fillRect(
                              x - handleSize / 2,
                              y - handleSize / 2,
                              handleSize,
                              handleSize,
                        );
                        ctx.strokeStyle = "#d4a000";
                        ctx.strokeRect(
                              x - handleSize / 2,
                              y - handleSize / 2,
                              handleSize,
                              handleSize,
                        );
                  }
                  ctx.restore();
            }
      } else {
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fillStyle = config.color;
            ctx.fill();
            ctx.restore();
      }

      if (studio.mode === "hitbox") {
            drawHitboxEditOverlay(studio, config, centerX, centerY);
      }

      const projectileAction = config.abilities
            .flatMap((ability) => ability.actions)
            .find((action) => action.type === "spawn-projectile");
      if (
            projectileAction?.type === "spawn-projectile" &&
            studio.images.projectile.complete &&
            studio.images.projectile.naturalWidth > 0
      ) {
            const imagePath = studio.projectileImageSelect.value;
            const imageScale =
                  projectileAction.projectile.imageScales?.[imagePath] ?? 1;
            const previewDiameter =
                  projectileAction.projectile.radius * 2 * imageScale;
            const maxSide = Math.max(
                  studio.images.projectile.naturalWidth,
                  studio.images.projectile.naturalHeight,
            );
            const drawScale = previewDiameter / maxSide;
            const width = studio.images.projectile.naturalWidth * drawScale;
            const height = studio.images.projectile.naturalHeight * drawScale;
            const previewX = centerX + Math.max(radius * 3.4, 118);
            const previewY = centerY;

            ctx.save();
            ctx.translate(previewX, previewY);
            ctx.rotate(studio.projectilePreviewAngle);
            ctx.drawImage(
                  studio.images.projectile,
                  -width / 2,
                  -height / 2,
                  width,
                  height,
            );
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = "rgba(38, 128, 235, 0.65)";
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(
                  previewX,
                  previewY,
                  projectileAction.projectile.radius,
                  0,
                  Math.PI * 2,
            );
            ctx.stroke();
            ctx.fillStyle = "rgba(20, 20, 20, 0.78)";
            ctx.fillRect(
                  previewX - 42,
                  previewY + Math.max(height / 2, 20) + 8,
                  84,
                  18,
            );
            ctx.fillStyle = "#b9cde6";
            ctx.font = "9px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                  "THROWN WEAPON",
                  previewX,
                  previewY + Math.max(height / 2, 20) + 17,
            );
            ctx.restore();
      }

      if (
            studio.images.weaponIdle.complete &&
            studio.images.weaponIdle.naturalWidth > 0
      ) {
            const maxSide = Math.max(
                  studio.images.weaponIdle.naturalWidth,
                  studio.images.weaponIdle.naturalHeight,
            );
            const weaponScale =
                  (radius * 2 * config.weaponScale) / maxSide;
            const weaponWidth =
                  studio.images.weaponIdle.naturalWidth * weaponScale;
            const weaponHeight =
                  studio.images.weaponIdle.naturalHeight * weaponScale;
            const swing = config.abilities
                  .flatMap((ability) => ability.actions)
                  .find((action) => action.type === "swing");
            const previewAngle =
                  swing?.type === "swing"
                        ? (swing.startDegrees * Math.PI) / 180
                        : 0;
            ctx.save();
            ctx.translate(
                  centerX + config.weaponPivot.x,
                  centerY + config.weaponPivot.y,
            );
            ctx.rotate(previewAngle);
            ctx.drawImage(
                  studio.images.weaponIdle,
                  config.weaponOffset.x -
                        config.weaponPivot.x -
                        weaponWidth / 2,
                  config.weaponOffset.y -
                        config.weaponPivot.y -
                        weaponHeight / 2,
                  weaponWidth,
                  weaponHeight,
            );
            ctx.restore();

            ctx.save();
            ctx.translate(
                  centerX + config.weaponPivot.x,
                  centerY + config.weaponPivot.y,
            );
            ctx.strokeStyle = "#ff5a5f";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(7, 0);
            ctx.moveTo(0, -7);
            ctx.lineTo(0, 7);
            ctx.stroke();
            ctx.restore();
      }

      const plusSize = radius * 2;
      const plusX = centerX - plusSize / 2 + config.healthBarOffset.x;
      const plusY = centerY - radius - 20 + config.healthBarOffset.y;

      ctx.save();
      tracePlusPath(studio, plusX, plusY, plusSize);
      ctx.fillStyle = "#222222";
      ctx.fill();

      ctx.save();
      tracePlusPath(studio, plusX, plusY, plusSize);
      ctx.clip();
      ctx.fillStyle = "hsl(120, 90%, 40%)";
      ctx.fillRect(plusX, plusY, plusSize, plusSize);
      ctx.restore();

      tracePlusPath(studio, plusX, plusY, plusSize);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      const indicatorCfg = studio.indicatorConfig;
      const textCfg = indicatorCfg.text as StudioTextStyle;
      const fontSize = Math.max(
            indicatorCfg.health.minFontSize,
            plusSize * indicatorCfg.health.sizeMultiplier,
      );
      const healthText = String(config.maxHealth ?? 100);
      ctx.fillStyle = textCfg.fillColor;
      ctx.strokeStyle = textCfg.strokeColor;
      ctx.lineWidth = textCfg.strokeWidth;
      ctx.font = `${textCfg.weight} ${fontSize}px ${textCfg.family}`;
      ctx.textAlign = textCfg.align;
      ctx.textBaseline = textCfg.baseline;
      ctx.strokeText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
      ctx.fillText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
      ctx.restore();
}
