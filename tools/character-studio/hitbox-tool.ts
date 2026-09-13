import type { Hitbox, Vector2 } from "../../src/types/fighter";
import type {
  EditableHitbox,
  NumericInput,
  Rect,
  StudioConfig,
} from "./studio-types";

type HitboxControls = Pick<
  Record<
    | "hitboxWidth"
    | "hitboxHeight"
    | "hitboxRadius"
    | "hitboxOffsetX"
    | "hitboxOffsetY",
    NumericInput
  >,
  | "hitboxWidth"
  | "hitboxHeight"
  | "hitboxRadius"
  | "hitboxOffsetX"
  | "hitboxOffsetY"
>;

export interface HitboxToolHost {
  canvas: HTMLCanvasElement;
  mode: "default" | "crop" | "hitbox";
  hitboxDraft: EditableHitbox | null;
  hitboxDraftOffset: Vector2 | null;
  dragState: {
    handle: string;
    startX: number;
    startY: number;
    startOffset: Vector2;
  } | null;
  hitboxType: HTMLSelectElement;
  applyHitboxBtn: HTMLButtonElement;
  cancelHitboxBtn: HTMLButtonElement;
  hitboxOutput: HTMLInputElement;
  controls: HitboxControls;
  _currentConfig(): StudioConfig;
  _ensureConfigShape(config: StudioConfig): void;
  _refreshLabels(): void;
  _saveState(): void;
  _draw(): void;
  _getPoseVisual(
    config: StudioConfig,
    poseKey: string,
  ): {
    imageScale: number;
    imageOffset: Vector2;
  };
  activePoseKey: string;
}

export function getHitboxRect(
  host: Pick<HitboxToolHost, "canvas">,
  config: Pick<StudioConfig, "hitbox" | "hitboxOffset">,
): Rect {
  const centerX = host.canvas.width / 2;
  const centerY = host.canvas.height / 2;
  const offset = config.hitboxOffset ?? { x: 0, y: 0 };
  const hitCenterX = centerX + offset.x;
  const hitCenterY = centerY + offset.y;
  if (config.hitbox.type === "box") {
    return {
      x: hitCenterX - config.hitbox.width / 2,
      y: hitCenterY - config.hitbox.height / 2,
      width: config.hitbox.width,
      height: config.hitbox.height,
    };
  }
  const radius = config.hitbox.radius;
  return {
    x: hitCenterX - radius,
    y: hitCenterY - radius,
    width: radius * 2,
    height: radius * 2,
  };
}

export function getSafetyRect(
  host: Pick<HitboxToolHost, "canvas" | "_getPoseVisual" | "activePoseKey">,
  config: StudioConfig,
): Rect {
  const visual = host._getPoseVisual(config, host.activePoseKey);
  const drawRadius = (config.radius ?? 30) * visual.imageScale;
  return {
    x: host.canvas.width / 2 + visual.imageOffset.x - drawRadius,
    y: host.canvas.height / 2 + visual.imageOffset.y - drawRadius,
    width: drawRadius * 2,
    height: drawRadius * 2,
  };
}

export function clampHitboxOffset(
  host: Pick<HitboxToolHost, "canvas" | "_getPoseVisual" | "activePoseKey">,
  config: StudioConfig,
  offset: Vector2,
): Vector2 {
  const safety = getSafetyRect(host, config);
  const centerX = host.canvas.width / 2;
  const centerY = host.canvas.height / 2;
  return {
    x: Math.max(
      -(centerX - safety.x),
      Math.min(offset.x, safety.x + safety.width - centerX),
    ),
    y: Math.max(
      -(centerY - safety.y),
      Math.min(offset.y, safety.y + safety.height - centerY),
    ),
  };
}

export function syncHitboxOffsetControls(
  host: Pick<HitboxToolHost, "controls">,
  offset: Vector2,
): void {
  host.controls.hitboxOffsetX.value = Math.round(offset.x);
  host.controls.hitboxOffsetY.value = Math.round(offset.y);
}

export function syncHitboxControlState(
  host: Pick<HitboxToolHost, "hitboxType" | "controls">,
): void {
  const isBox = host.hitboxType.value === "box";
  host.controls.hitboxWidth.disabled = !isBox;
  host.controls.hitboxHeight.disabled = !isBox;
  host.controls.hitboxRadius.disabled = isBox;
}

export function syncHitboxControls(
  host: Pick<HitboxToolHost, "hitboxType" | "controls">,
  config: StudioConfig,
): void {
  host.hitboxType.value = config.hitbox.type;
  host.controls.hitboxWidth.value =
    config.hitbox.type === "box" ? config.hitbox.width : 44;
  host.controls.hitboxHeight.value =
    config.hitbox.type === "box" ? config.hitbox.height : 88;
  host.controls.hitboxRadius.value =
    config.hitbox.type === "circle"
      ? config.hitbox.radius
      : (config.radius ?? 30);
  syncHitboxOffsetControls(host, config.hitboxOffset ?? { x: 0, y: 0 });
  syncHitboxControlState(host);
}

export function updateHitboxButtons(
  host: Pick<
    HitboxToolHost,
    "mode" | "hitboxDraft" | "applyHitboxBtn" | "cancelHitboxBtn"
  >,
): void {
  const active = host.mode === "hitbox";
  host.applyHitboxBtn.disabled = !active || !host.hitboxDraft;
  host.cancelHitboxBtn.disabled = !active;
}

export function enterHitboxMode(host: HitboxToolHost): void {
  const config = host._currentConfig();
  host._ensureConfigShape(config);
  host.hitboxDraft = { ...config.hitbox };
  host.hitboxDraftOffset = { ...(config.hitboxOffset ?? { x: 0, y: 0 }) };
  host.mode = "hitbox";
  host.dragState = null;
  updateHitboxButtons(host);
  host._draw();
}

export function applyHitbox(host: HitboxToolHost): void {
  if (!host.hitboxDraft) return;
  const config = host._currentConfig();
  config.hitbox = { ...host.hitboxDraft };
  config.hitboxOffset = { ...(host.hitboxDraftOffset ?? { x: 0, y: 0 }) };
  syncHitboxControls(host, config);
  host._refreshLabels();
  host._saveState();
  host.mode = "default";
  host.dragState = null;
  host.hitboxDraft = null;
  updateHitboxButtons(host);
  host._draw();
}

export function cancelHitbox(host: HitboxToolHost): void {
  host.mode = "default";
  host.dragState = null;
  host.hitboxDraft = null;
  host.hitboxDraftOffset = null;
  updateHitboxButtons(host);
  host._draw();
}

export function hitTestRectHandles(
  px: number,
  py: number,
  rect: Rect,
): string | null {
  const half = 6;
  const hits: Array<[string, number, number]> = [
    ["nw", rect.x, rect.y],
    ["n", rect.x + rect.width / 2, rect.y],
    ["ne", rect.x + rect.width, rect.y],
    ["w", rect.x, rect.y + rect.height / 2],
    ["e", rect.x + rect.width, rect.y + rect.height / 2],
    ["sw", rect.x, rect.y + rect.height],
    ["s", rect.x + rect.width / 2, rect.y + rect.height],
    ["se", rect.x + rect.width, rect.y + rect.height],
  ];
  for (const [name, x, y] of hits)
    if (Math.abs(px - x) <= half && Math.abs(py - y) <= half) return name;
  return px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
    ? "move"
    : null;
}

export function hitTestCircleHandle(
  px: number,
  py: number,
  rect: Rect,
): string | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = rect.width / 2;
  const distance = Math.hypot(px - cx, py - cy);
  return Math.abs(distance - radius) <= 10
    ? "radius"
    : distance < radius
      ? "move"
      : null;
}

export function updateHitboxDrag(host: HitboxToolHost, point: Vector2): void {
  const drag = host.dragState;
  const draft = host.hitboxDraft;
  if (!drag || !draft) return;
  const config = host._currentConfig();
  const deltaX = point.x - drag.startX;
  const deltaY = point.y - drag.startY;
  const offset = drag.startOffset;
  const centerX = host.canvas.width / 2;
  const centerY = host.canvas.height / 2;
  if (draft.type === "box") {
    let width = draft.width;
    let height = draft.height;
    if (drag.handle === "move")
      host.hitboxDraftOffset = clampHitboxOffset(host, config, {
        x: offset.x + deltaX,
        y: offset.y + deltaY,
      });
    else {
      if (drag.handle.includes("e") || drag.handle.includes("w"))
        width = Math.max(10, Math.abs(point.x - centerX - offset.x) * 2);
      if (drag.handle.includes("n") || drag.handle.includes("s"))
        height = Math.max(10, Math.abs(point.y - centerY - offset.y) * 2);
      host.hitboxDraftOffset = clampHitboxOffset(host, config, offset);
    }
    host.hitboxDraft = {
      type: "box",
      width: Math.round(width),
      height: Math.round(height),
    };
    host.controls.hitboxWidth.value = host.hitboxDraft.width;
    host.controls.hitboxHeight.value = host.hitboxDraft.height;
  } else {
    let radius = draft.radius;
    if (drag.handle === "move")
      host.hitboxDraftOffset = clampHitboxOffset(host, config, {
        x: offset.x + deltaX,
        y: offset.y + deltaY,
      });
    else {
      radius = Math.max(
        5,
        Math.round(
          Math.hypot(
            point.x - centerX - offset.x,
            point.y - centerY - offset.y,
          ),
        ),
      );
      host.hitboxDraftOffset = clampHitboxOffset(host, config, offset);
    }
    host.hitboxDraft = { type: "circle", radius };
    host.controls.hitboxRadius.value = radius;
  }
  syncHitboxOffsetControls(host, host.hitboxDraftOffset ?? { x: 0, y: 0 });
  host._refreshLabels();
}

export function applyHitboxOutput(host: HitboxToolHost): void {
  const config = host._currentConfig();
  const numbers =
    host.hitboxOutput.value.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const target =
    host.mode === "hitbox" && host.hitboxDraft
      ? host.hitboxDraft
      : config.hitbox;
  const offset =
    host.mode === "hitbox"
      ? { ...(host.hitboxDraftOffset ?? config.hitboxOffset ?? { x: 0, y: 0 }) }
      : { ...(config.hitboxOffset ?? { x: 0, y: 0 }) };
  if (target.type === "box") {
    if (numbers.length < 2) return refreshHitboxOutput(host);
    target.width = Math.max(10, Math.round(numbers[0]));
    target.height = Math.max(10, Math.round(numbers[1]));
    host.controls.hitboxWidth.value = target.width;
    host.controls.hitboxHeight.value = target.height;
    host.controls.hitboxRadius.value = Math.round(
      Math.max(target.width, target.height) / 2,
    );
    if (numbers.length >= 4) {
      offset.x = Math.round(numbers[2]);
      offset.y = Math.round(numbers[3]);
    }
  } else {
    if (numbers.length < 1) return refreshHitboxOutput(host);
    target.radius = Math.max(5, Math.round(numbers[0]));
    host.controls.hitboxRadius.value = target.radius;
    if (numbers.length >= 3) {
      offset.x = Math.round(numbers[1]);
      offset.y = Math.round(numbers[2]);
    }
  }
  const safeOffset = clampHitboxOffset(host, config, offset);
  if (host.mode === "hitbox") {
    host.hitboxDraft = target;
    host.hitboxDraftOffset = safeOffset;
  } else {
    config.hitbox = { ...target };
    config.hitboxOffset = safeOffset;
    host._saveState();
  }
  syncHitboxOffsetControls(host, safeOffset);
  host._refreshLabels();
  host._draw();
}

export function refreshHitboxOutput(
  host: Pick<
    HitboxToolHost,
    | "mode"
    | "hitboxDraft"
    | "hitboxDraftOffset"
    | "hitboxOutput"
    | "_currentConfig"
  >,
): void {
  const config = host._currentConfig();
  const hitbox =
    host.mode === "hitbox" && host.hitboxDraft
      ? host.hitboxDraft
      : config.hitbox;
  const offset =
    host.mode === "hitbox" && host.hitboxDraftOffset
      ? host.hitboxDraftOffset
      : (config.hitboxOffset ?? { x: 0, y: 0 });
  host.hitboxOutput.value =
    hitbox.type === "box"
      ? `${Math.round(hitbox.width)} ${Math.round(hitbox.height)} ${Math.round(offset.x)} ${Math.round(offset.y)}`
      : `${Math.round(hitbox.radius)} ${Math.round(offset.x)} ${Math.round(offset.y)}`;
}

export function updateHitboxFromInputs(
  host: HitboxToolHost,
  hitbox: Hitbox,
  offset: Vector2,
): void {
  const config = host._currentConfig();
  const safeOffset = clampHitboxOffset(host, config, offset);
  if (host.mode === "hitbox") {
    host.hitboxDraft = hitbox;
    host.hitboxDraftOffset = safeOffset;
  } else {
    config.hitbox = hitbox;
    config.hitboxOffset = safeOffset;
  }
  syncHitboxOffsetControls(host, safeOffset);
}
