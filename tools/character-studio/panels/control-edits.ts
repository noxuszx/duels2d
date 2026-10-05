import type { Hitbox } from "../../../src/types/fighter";
import type { ControlName, NumericInput } from "../app/editor-types";
import { numberValue } from "../ui/dom";
import { _normalizeCropBounds } from "../tools/crop/crop-geometry";
import { _syncCropControls, type CropToolHost } from "../tools/crop/crop-tool";
import {
      updateHitboxFromInputs,
      type HitboxToolHost,
} from "../tools/body-hitbox/body-hitbox-tool";
import type { WeaponPanelHost } from "./weapon-panel";

export type ControlEditHost = CropToolHost &
      HitboxToolHost &
      WeaponPanelHost & {
            controls: Record<ControlName, NumericInput>;
      };

/** Edit the concern that emitted an input event, without materializing other overrides. */
export function applyControlEdit(
      host: ControlEditHost,
      key?: ControlName | "hitboxType",
): void {
      const config = host._currentConfig();
      const matches = (...prefixes: string[]) =>
            key === undefined ||
            prefixes.some((prefix) => key.startsWith(prefix));
      const value = (control: ControlName, fallback = 0, round = false) => {
            const next = numberValue(host.controls[control]);
            const finite = Number.isFinite(next) ? next : fallback;
            return round ? Math.round(finite) : finite;
      };

      if (matches("hitbox")) {
            const current =
                  host.mode === "hitbox" && host.hitboxDraft
                        ? host.hitboxDraft
                        : config.hitbox;
            const offset =
                  host.mode === "hitbox" && host.hitboxDraftOffset
                        ? host.hitboxDraftOffset
                        : (config.hitboxOffset ?? { x: 0, y: 0 });
            const next: Hitbox =
                  host.hitboxType.value === "box"
                        ? {
                              type: "box",
                              width: Math.max(
                                    1,
                                    value(
                                          "hitboxWidth",
                                          current.type === "box"
                                                ? current.width
                                                : 44,
                                          true,
                                    ),
                              ),
                              height: Math.max(
                                    1,
                                    value(
                                          "hitboxHeight",
                                          current.type === "box"
                                                ? current.height
                                                : 88,
                                          true,
                                    ),
                              ),
                        }
                        : {
                              type: "circle",
                              radius: Math.max(
                                    1,
                                    value(
                                          "hitboxRadius",
                                          current.type === "circle"
                                                ? current.radius
                                                : 30,
                                          true,
                                    ),
                              ),
                        };
            updateHitboxFromInputs(host, next, {
                  x: value("hitboxOffsetX", offset.x),
                  y: value("hitboxOffsetY", offset.y),
            });
      }
      if (matches("imageScale")) {
            const visual = host._getPoseVisual(config, host.activePoseKey);
            host._setPoseVisual(config, host.activePoseKey, {
                  imageScale: value("imageScale", visual.imageScale),
            });
      }
      if (matches("imageOffset")) {
            const visual = host._getPoseVisual(config, host.activePoseKey);
            host._setPoseVisual(config, host.activePoseKey, {
                  imageOffset: {
                        x: value("imageOffsetX", visual.imageOffset.x, true),
                        y: value("imageOffsetY", visual.imageOffset.y, true),
                  },
            });
      }
      if (matches("healthBar")) {
            config.healthBarOffset = {
                  x: value("healthBarOffsetX", config.healthBarOffset?.x, true),
                  y: value("healthBarOffsetY", config.healthBarOffset?.y, true),
            };
      }
      if (matches("weaponScale"))
            config.weaponScale = value("weaponScale", config.weaponScale);
      if (matches("weaponOffset"))
            config.weaponOffset = {
                  x: value("weaponOffsetX", config.weaponOffset?.x, true),
                  y: value("weaponOffsetY", config.weaponOffset?.y, true),
            };
      if (matches("weaponPivot"))
            config.weaponPivot = {
                  x: value("weaponPivotX", config.weaponPivot?.x, true),
                  y: value("weaponPivotY", config.weaponPivot?.y, true),
            };
      if (matches("swing")) {
            const swing = host._swingAction();
            if (swing) {
                  swing.startDegrees = value(
                        "swingStartDegrees",
                        swing.startDegrees,
                  );
                  swing.endDegrees = value("swingEndDegrees", swing.endDegrees);
            }
      }
      if (matches("attackHitbox")) {
            const attack = host._attackHitboxAction();
            if (attack) {
                  attack.width = Math.max(
                        1,
                        value("attackHitboxWidth", attack.width),
                  );
                  attack.height = Math.max(
                        1,
                        value("attackHitboxHeight", attack.height),
                  );
                  attack.offset = {
                        x: value("attackHitboxOffsetX", attack.offset.x),
                        y: value("attackHitboxOffsetY", attack.offset.y),
                  };
            }
      }
      if (matches("imageCrop")) {
            const existing =
                  host.mode === "crop"
                        ? host.cropDraft
                        : host._getPoseVisual(config, host.activePoseKey)
                              .imageCrop;
            const image = host.images.body;
            const fallbackWidth =
                  image.complete && image.naturalWidth > 0
                        ? image.naturalWidth
                        : 512;
            const fallbackHeight =
                  image.complete && image.naturalHeight > 0
                        ? image.naturalHeight
                        : 512;
            const current = existing ?? {
                  x: 0,
                  y: 0,
                  width: fallbackWidth,
                  height: fallbackHeight,
            };
            let crop = {
                  x: Math.max(0, value("imageCropX", current.x, true)),
                  y: Math.max(0, value("imageCropY", current.y, true)),
                  width: Math.max(
                        1,
                        value("imageCropWidth", current.width, true),
                  ),
                  height: Math.max(
                        1,
                        value("imageCropHeight", current.height, true),
                  ),
            };
            if (
                  image.complete &&
                  image.naturalWidth > 0 &&
                  image.naturalHeight > 0
            ) {
                  crop = _normalizeCropBounds(host, crop, image);
            }
            if (host.mode === "crop") host.cropDraft = crop;
            else
                  host._setPoseVisual(config, host.activePoseKey, {
                        imageCrop: crop,
                  });
            _syncCropControls(host, { imageCrop: crop });
      }
      host._refreshLabels();
}
