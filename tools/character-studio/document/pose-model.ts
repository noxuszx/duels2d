import type { PoseConfig } from "../../../src/types/fighter";
import type { PosePatch, PoseVisual, StudioConfig } from "../app/editor-types";
import { ensurePoseBank, type StudioForm } from "./form-model";
import { spriteCatalog } from "../assets/sprite-catalog";

export const SUPPORTED_POSE_KEYS = [
      "idle",
      "attackWindup",
      "attackActive",
      "recovery",
      "crawl1",
      "crawl2",
] as const;

export interface PoseModelHost {
      activeForm?: StudioForm;
      _poseBank(config?: StudioConfig): Record<string, PoseConfig>;
      _getPoseImagePath(config: StudioConfig, poseKey: string): string;
}

export function _getPoseConfig(
      host: PoseModelHost,
      config: StudioConfig,
      poseKey: string,
): PoseConfig | null | undefined {
      if (poseKey === "base") return null;
      return host._poseBank(config)[poseKey] ??
            (host.activeForm !== "base" ? config.poses?.[poseKey] : undefined);
}

export function _getPoseImagePath(
      host: PoseModelHost,
      config: StudioConfig,
      poseKey: string,
): string {
      if (poseKey === "base") return config.image ?? "";
      const poseVal = _getPoseConfig(host, config, poseKey);
      if (!poseVal) return config.image ?? "";
      if (typeof poseVal === "string") return poseVal;
      return poseVal.image ?? config.image ?? "";
}

export function _setPoseImagePath(
      host: PoseModelHost,
      config: StudioConfig,
      poseKey: string,
      imagePath: string,
): void {
      if (poseKey === "base") {
            config.image = imagePath;
            return;
      }
      const poses = ensurePoseBank(config, host.activeForm ?? "base");
      const existing = poses[poseKey] ??
            (host.activeForm !== "base" ? config.poses?.[poseKey] : undefined);
      poses[poseKey] =
            existing && typeof existing === "object"
                  ? { ...existing, image: imagePath }
                  : {
                        image: imagePath,
                        imageScale: config.imageScale,
                        imageOffset: { ...config.imageOffset },
                        imageCrop: config.imageCrop
                              ? { ...config.imageCrop }
                              : null,
                  };
}

export function _availableSpritePaths(
      host: PoseModelHost,
      config: StudioConfig,
): string[] {
      const configuredPaths = [
            config.image,
            ...Object.values(config.poses ?? {}).map((pose) =>
                  typeof pose === "string" ? pose : pose.image,
            ),
            ...Object.values(config.forms ?? {}).flatMap((form) =>
                  Object.values(form.poses ?? {}).map((pose) =>
                        typeof pose === "string" ? pose : pose.image,
                  ),
            ),
      ].filter((path): path is string => Boolean(path));
      const directories = new Set(
            configuredPaths
                  .map((path) => path.slice(0, path.lastIndexOf("/") + 1))
                  .filter((path) => path.includes("/sprites/")),
      );
      if (directories.size === 0) {
            directories.add(`assets/fighters/${config.id}/sprites/`);
      }
      return spriteCatalog.filter((path) =>
            [...directories].some((directory) => path.startsWith(directory)),
      );
}

export function _getPoseVisual(
      host: PoseModelHost,
      config: StudioConfig,
      poseKey: string,
): PoseVisual {
      if (poseKey === "base") {
            return {
                  imageScale: config.imageScale ?? 1,
                  imageOffset: config.imageOffset ?? { x: 0, y: 0 },
                  imageCrop: config.imageCrop ?? null,
            };
      }
      const poseVal = _getPoseConfig(host, config, poseKey);
      const poseObj: Partial<Exclude<PoseConfig, string>> =
            poseVal && typeof poseVal === "object" ? poseVal : {};
      return {
            imageScale: poseObj.imageScale ?? config.imageScale ?? 1,
            imageOffset: poseObj.imageOffset ??
                  config.imageOffset ?? { x: 0, y: 0 },
            imageCrop:
                  "imageCrop" in poseObj
                        ? (poseObj.imageCrop ?? null)
                        : (config.imageCrop ?? null),
      };
}

export function _setPoseVisual(
      host: PoseModelHost,
      config: StudioConfig,
      poseKey: string,
      patch: PosePatch,
): void {
      if (poseKey === "base") {
            if (patch.imageScale !== undefined)
                  config.imageScale = patch.imageScale;
            if (patch.imageOffset !== undefined)
                  config.imageOffset = { ...patch.imageOffset };
            if ("imageCrop" in patch)
                  config.imageCrop = patch.imageCrop
                        ? { ...patch.imageCrop }
                        : null;
            return;
      }
      const poses = ensurePoseBank(config, host.activeForm ?? "base");
      const existing = poses[poseKey] ??
            (host.activeForm !== "base" ? config.poses?.[poseKey] : undefined);
      const poseObj: Exclude<PoseConfig, string> =
            existing && typeof existing === "object"
                  ? structuredClone(existing)
                  : {
                        image:
                              typeof existing === "string"
                                    ? existing
                                    : host._getPoseImagePath(config, poseKey),
                  };
      if (patch.imageScale !== undefined) poseObj.imageScale = patch.imageScale;
      if (patch.imageOffset !== undefined)
            poseObj.imageOffset = { ...patch.imageOffset };
      if ("imageCrop" in patch)
            poseObj.imageCrop = patch.imageCrop ? { ...patch.imageCrop } : null;
      poses[poseKey] = poseObj;
}
