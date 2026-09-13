import type { PoseConfig } from "../../src/types/fighter";
import type { StudioConfig } from "./studio-types";

/** Creates an isolated, serializable history entry for the current fighter edit. */
export function snapshotStudioState(
  config: StudioConfig,
  activePoseKey: string,
): string {
  const posesSnapshot: Record<string, PoseConfig> = {};
  for (const [key, pose] of Object.entries(config.poses ?? {})) {
    posesSnapshot[key] =
      typeof pose === "string" ? pose : structuredClone(pose);
  }
  return JSON.stringify({
    hitbox: structuredClone(config.hitbox),
    hitboxOffset: structuredClone(config.hitboxOffset ?? { x: 0, y: 0 }),
    defaultFacing: config.defaultFacing ?? "right",
    imageScale: config.imageScale,
    imageOffset: structuredClone(config.imageOffset),
    imageCrop: config.imageCrop ? structuredClone(config.imageCrop) : null,
    healthBarOffset: structuredClone(config.healthBarOffset),
    weaponScale: config.weaponScale,
    weaponOffset: structuredClone(config.weaponOffset),
    poses: posesSnapshot,
    activePoseKey,
  });
}

/** Drops redo entries and appends a new edit snapshot. */
export function appendHistory(
  history: string[],
  historyIndex: number,
  snapshot: string,
): { history: string[]; historyIndex: number } {
  const nextHistory = history.slice(0, historyIndex + 1);
  nextHistory.push(snapshot);
  return { history: nextHistory, historyIndex: nextHistory.length - 1 };
}
