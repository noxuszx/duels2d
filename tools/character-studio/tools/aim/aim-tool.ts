import type {
      AimSkillOptions,
      PoseOverrides,
      Vector2,
} from "../../../../src/types/fighter";
import type { PoseConfig } from "../../../../src/types/fighter";
import type { PoseVisual, StudioConfig } from "../../app/editor-types";

export interface AimToolHost {
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      mode: "default" | "crop" | "hitbox";
      activePoseKey: string;
      activeForm: string;
      isRestoring: boolean;
      _currentConfig(): StudioConfig;
      _poseBank(): Record<string, PoseConfig>;
      _getPoseVisual(config: StudioConfig, poseKey: string): PoseVisual;
      _setPoseVisual(
            config: StudioConfig,
            poseKey: string,
            patch: Partial<PoseVisual>,
      ): void;
      _saveState(): void;
      _draw(): void;
}
import { requireElement } from "../../ui/dom";
import { ensureFormComponents, formComponents } from "../../document/form-model";

type PointName = "muzzle" | "pivot";

/** Edits the opt-in skill and sprite-local firing geometry without a target preview. */
export class AimTool {
      private target = requireElement<HTMLSelectElement>("aim-target");
      private get weaponEditing(): boolean { return this.target.value === "weapon"; }
      private enabled = requireElement<HTMLInputElement>("aim-enabled");
      private override = requireElement<HTMLInputElement>("aim-pose-override");
      private settings = requireElement<HTMLFieldSetElement>("aim-settings");
      private inputs = {
            muzzleX: requireElement<HTMLInputElement>("aim-muzzle-x"),
            muzzleY: requireElement<HTMLInputElement>("aim-muzzle-y"),
            pivotX: requireElement<HTMLInputElement>("aim-pivot-x"),
            pivotY: requireElement<HTMLInputElement>("aim-pivot-y"),
            forward: requireElement<HTMLInputElement>("aim-forward"),
      };
      private drag: {
            point: PointName;
            pointerId: number;
            pose: string;
            form: string;
            configId: string;
            attachment: string;
      } | null = null;

      constructor(private readonly studio: AimToolHost) {
            this.target.addEventListener("change", () => { this.sync(); studio._draw(); });
            this.enabled.addEventListener("change", () => {
                  const config = studio._currentConfig();
                  const components = ensureFormComponents(config, studio.activeForm);
                  if (this.enabled.checked) {
                        components[this.weaponEditing ? "weaponAim" : "aim"] = {
                              muzzle: {
                                    x: config.defaultFacing === "left" ? -50 : 50,
                                    y: 0,
                              },
                              pivot: { x: 0, y: 0 },
                        };
                  } else {
                        delete components[this.weaponEditing ? "weaponAim" : "aim"];
                  }
                  studio._saveState();
                  studio._draw();
            });
            this.override.addEventListener("change", () => {
                  const options = this.options;
                  if (!options || this.weaponEditing) return;
                  if (this.override.checked)
                        this.poseRecord().aim = structuredClone(options);
                  else delete this.poseRecord().aim;
                  studio._saveState();
                  studio._draw();
            });
            const updateOptions = () => {
                  if (!this.options) return;
                  const values = Object.values(this.inputs).map(
                        (control) => control.valueAsNumber,
                  );
                  if (values.every(Number.isFinite)) {
                        this.setOptions({
                              muzzle: {
                                    x: this.inputs.muzzleX.valueAsNumber,
                                    y: this.inputs.muzzleY.valueAsNumber,
                              },
                              pivot: {
                                    x: this.inputs.pivotX.valueAsNumber,
                                    y: this.inputs.pivotY.valueAsNumber,
                              },
                              forwardDegrees: this.inputs.forward.valueAsNumber,
                        });
                  }
                  studio._draw();
            };
            for (const input of Object.values(this.inputs)) {
                  input.addEventListener("input", () => {
                        if (!studio.isRestoring) updateOptions();
                  });
                  input.addEventListener("change", () => {
                        if (studio.isRestoring) return;
                        updateOptions();
                        studio._saveState();
                  });
            }
      }

      private get editing(): boolean {
            return (
                  this.studio.mode === "default" &&
                  requireElement("tab-aim").classList.contains("active")
            );
      }

      private get pose(): PoseOverrides | null {
            const pose = this.studio._poseBank()[this.studio.activePoseKey];
            return this.studio.activePoseKey !== "base" &&
                  typeof pose === "object"
                  ? pose
                  : null;
      }

      private poseRecord(): PoseOverrides {
            this.studio._setPoseVisual(
                  this.studio._currentConfig(),
                  this.studio.activePoseKey,
                  {},
            );
            return this.studio._poseBank()[
                  this.studio.activePoseKey
            ] as PoseOverrides;
      }

      private get options(): AimSkillOptions | null {
            const components = formComponents(this.studio._currentConfig(), this.studio.activeForm);
            if (this.weaponEditing) return components?.weaponAim ?? null;
            const aim = components?.aim;
            return aim ? (this.pose?.aim ?? aim) : null;
      }

      private setOptions(options: AimSkillOptions): void {
            if (this.weaponEditing) ensureFormComponents(this.studio._currentConfig(), this.studio.activeForm).weaponAim = options;
            else if (this.pose?.aim) this.poseRecord().aim = options;
            else ensureFormComponents(this.studio._currentConfig(), this.studio.activeForm).aim = options;
      }

      sync(): void {
            const config = this.studio._currentConfig();
            const options = this.options;
            this.enabled.checked = Boolean(formComponents(config, this.studio.activeForm)?.[this.weaponEditing ? "weaponAim" : "aim"]);
            this.settings.disabled = !options;
            this.override.checked = !this.weaponEditing && Boolean(this.pose?.aim);
            this.override.disabled = this.weaponEditing || this.studio.activePoseKey === "base";
            const values = {
                  muzzleX: options?.muzzle.x ?? 0,
                  muzzleY: options?.muzzle.y ?? 0,
                  pivotX: options?.pivot?.x ?? 0,
                  pivotY: options?.pivot?.y ?? 0,
                  forward:
                        options?.forwardDegrees ??
                        (config.defaultFacing === "left" ? 180 : 0),
            };
            for (const key of Object.keys(values) as Array<
                  keyof typeof values
            >) {
                  const slider = this.inputs[key];
                  const numberInput = document.querySelector<HTMLInputElement>(
                        `.num-input[data-for="${slider.id}"]`,
                  );
                  const value = values[key];
                  // Preserve authored or dragged positions beyond the initial slider range.
                  const bound = key === "forward" ? 180 : 200;
                  slider.min = String(Math.min(-bound, Math.floor(value)));
                  slider.max = String(Math.max(bound, Math.ceil(value)));
                  if (numberInput) {
                        numberInput.min = slider.min;
                        numberInput.max = slider.max;
                        if (document.activeElement !== numberInput)
                              numberInput.value = String(value);
                  }
                  // Animated projectile previews redraw continuously; preserve typing.
                  if (document.activeElement !== slider)
                        slider.value = String(value);
                  requireElement(`val-${slider.id}`).textContent =
                        `${Number(value.toFixed(1))}${key === "forward" ? "°" : ""}`;
            }
      }

      private previewPoint(point: Vector2): Vector2 {
            const config = this.studio._currentConfig();
            const visual = this.studio._getPoseVisual(
                  config,
                  this.studio.activePoseKey,
            );
            // Aim coordinates belong to the original, unmirrored sprite.
            return {
                  x:
                        this.studio.canvas.width / 2 +
                        (this.weaponEditing ? 0 : visual.imageOffset.x) +
                        point.x,
                  y:
                        this.studio.canvas.height / 2 +
                        (this.weaponEditing ? 0 : visual.imageOffset.y) +
                        point.y,
            };
      }

      private eventPoint(event: PointerEvent): Vector2 {
            const rect = this.studio.canvas.getBoundingClientRect();
            return {
                  x:
                        ((event.clientX - rect.left) *
                              this.studio.canvas.width) /
                        rect.width,
                  y:
                        ((event.clientY - rect.top) *
                              this.studio.canvas.height) /
                        rect.height,
            };
      }

      onPointerDown(event: PointerEvent): boolean {
            if (!this.editing || !this.options) return false;
            const point = this.eventPoint(event);
            for (const name of ["muzzle", "pivot"] as const) {
                  const marker = this.previewPoint(
                        this.options[name] ?? { x: 0, y: 0 },
                  );
                  if (Math.hypot(point.x - marker.x, point.y - marker.y) > 12)
                        continue;
                  this.drag = {
                        point: name,
                        pointerId: event.pointerId,
                        pose: this.studio.activePoseKey,
                        form: this.studio.activeForm,
                        configId: this.studio._currentConfig().id,
                        attachment: this.target.value,
                  };
                  this.studio.canvas.setPointerCapture(event.pointerId);
                  event.preventDefault();
                  return true;
            }
            // Aim editing owns the canvas, so overlapping attack hitboxes cannot intercept it.
            return true;
      }

      onPointerMove(event: PointerEvent): boolean {
            if (!this.drag || this.drag.pointerId !== event.pointerId)
                  return false;
            if (
                  !this.options ||
                  this.drag.attachment !== this.target.value ||
                  this.drag.pose !== this.studio.activePoseKey ||
                  this.drag.form !== this.studio.activeForm ||
                  this.drag.configId !== this.studio._currentConfig().id
            ) {
                  this.onPointerUp(event);
                  return true;
            }
            const point = this.eventPoint(event);
            const center = this.previewPoint({ x: 0, y: 0 });
            this.setOptions({
                  ...this.options,
                  [this.drag.point]: {
                        x: Math.round((point.x - center.x) * 10) / 10,
                        y: Math.round((point.y - center.y) * 10) / 10,
                  },
            });
            this.studio._draw();
            return true;
      }

      onPointerUp(event: PointerEvent): boolean {
            if (!this.drag || this.drag.pointerId !== event.pointerId)
                  return false;
            if (this.studio.canvas.hasPointerCapture(event.pointerId))
                  this.studio.canvas.releasePointerCapture(event.pointerId);
            this.drag = null;
            this.studio._saveState();
            return true;
      }

      draw(): void {
            const options = this.options;
            if (!this.editing || !options) return;
            const ctx = this.studio.ctx;
            const muzzle = this.previewPoint(options.muzzle);
            const pivot = this.previewPoint(options.pivot ?? { x: 0, y: 0 });
            const config = this.studio._currentConfig();
            const angle =
                  ((options.forwardDegrees ??
                        (config.defaultFacing === "left" ? 180 : 0)) *
                        Math.PI) /
                  180;
            const dx = Math.cos(angle),
                  dy = Math.sin(angle);
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#008caa";
            ctx.beginPath();
            ctx.moveTo(muzzle.x, muzzle.y);
            ctx.lineTo(muzzle.x + dx * 45, muzzle.y + dy * 45);
            ctx.lineTo(
                  muzzle.x + dx * 35 - dy * 5,
                  muzzle.y + dy * 35 + dx * 5,
            );
            ctx.moveTo(muzzle.x + dx * 45, muzzle.y + dy * 45);
            ctx.lineTo(
                  muzzle.x + dx * 35 + dy * 5,
                  muzzle.y + dy * 35 - dx * 5,
            );
            ctx.stroke();
            for (const [point, color, label] of [
                  [muzzle, "#008caa", "Muzzle"],
                  [pivot, "#c66b00", "Pivot"],
            ] as const) {
                  ctx.strokeStyle = color;
                  ctx.fillStyle = "white";
                  ctx.beginPath();
                  ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(point.x - 11, point.y);
                  ctx.lineTo(point.x + 11, point.y);
                  ctx.moveTo(point.x, point.y - 11);
                  ctx.lineTo(point.x, point.y + 11);
                  ctx.stroke();
                  ctx.fillStyle = color;
                  ctx.font = "12px sans-serif";
                  ctx.textAlign = "left";
                  ctx.fillText(label, point.x + 12, point.y - 12);
            }
            ctx.restore();
      }
}
