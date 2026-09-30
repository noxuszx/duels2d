import type { FighterTransformationConfig, PoseConfig } from "../../src/types/fighter";
import type { StudioConfig } from "./studio-types";
import type { CharacterStudio } from "./studio-app";
import { requireElement } from "./studio-elements";
import { poseLabel } from "./pose-label";

export type StudioForm = "base" | "transformed";

export function poseBank(config: StudioConfig, form: StudioForm): Record<string, PoseConfig> {
      if (form === "transformed" && config.transformation) {
            return config.transformation.poses ??= {};
      }
      return config.poses ??= {};
}

export function createTransformation(config: StudioConfig): FighterTransformationConfig {
      return {
            trigger: { type: "health-threshold", healthRatio: 0.4 },
            sequence: [],
            abilities: structuredClone(config.abilities),
            poses: structuredClone(config.poses),
      };
}

/** Keeps form selection and sequence authoring outside the Studio coordinator. */
export class TransformationTool {
      private form = requireElement<HTMLSelectElement>("form-select");
      private enabled = requireElement<HTMLInputElement>("transformation-enabled");
      private threshold = requireElement<HTMLInputElement>("transformation-threshold");
      private steps = requireElement<HTMLElement>("transformation-steps");
      private previewFrame = 0;

      constructor(private studio: CharacterStudio) {
            this.form.addEventListener("change", () => {
                  this.stopPreview();
                  studio.activeForm = this.form.value as StudioForm;
                  studio._refreshForm();
            });
            this.enabled.addEventListener("change", () => {
                  this.stopPreview();
                  const config = studio._currentConfig();
                  config.transformation = this.enabled.checked ? createTransformation(config) : null;
                  if (!config.transformation) studio.activeForm = "base";
                  studio._refreshForm();
                  studio._saveState();
            });
            this.threshold.addEventListener("change", () => {
                  const value = this.threshold.valueAsNumber;
                  if (!Number.isFinite(value) || value <= 0 || value > 100) {
                        this.sync();
                        return;
                  }
                  const transformation = studio._currentConfig().transformation;
                  if (transformation) transformation.trigger.healthRatio = value / 100;
                  studio._saveState();
            });
            requireElement("add-transformation-step").addEventListener("click", () => {
                  const transformation = studio._currentConfig().transformation;
                  const pose = Object.keys(transformation?.poses ?? {})[0];
                  if (!transformation || !pose) return;
                  (transformation.sequence ??= []).push({ pose, durationMs: 600 });
                  this.sync();
                  studio._saveState();
            });
            requireElement("preview-transformation").addEventListener("click", () => this.preview());
      }

      sync(): void {
            this.stopPreview();
            const transformation = this.studio._currentConfig().transformation;
            this.enabled.checked = Boolean(transformation);
            this.form.options[1].disabled = !transformation;
            this.form.value = this.studio.activeForm;
            requireElement<HTMLFieldSetElement>("transformation-settings").disabled = !transformation;
            this.threshold.value = String((transformation?.trigger.healthRatio ?? 0.4) * 100);
            this.steps.replaceChildren();
            const poses = Object.keys(transformation?.poses ?? {});
            requireElement<HTMLButtonElement>("add-transformation-step").disabled = !poses.length;
            transformation?.sequence?.forEach((step, index) => {
                  const row = document.createElement("div");
                  row.className = "sequence-step";
                  const pose = document.createElement("select");
                  pose.setAttribute("aria-label", `Step ${index + 1} sprite`);
                  poses.forEach((key) => pose.add(new Option(poseLabel(key), key)));
                  pose.value = step.pose;
                  pose.addEventListener("change", () => {
                        this.stopPreview();
                        step.pose = pose.value;
                        this.studio._saveState();
                  });
                  const duration = document.createElement("input");
                  duration.type = "number";
                  duration.min = "1";
                  duration.step = "1";
                  duration.value = String(step.durationMs);
                  duration.setAttribute("aria-label", `Step ${index + 1} duration in milliseconds`);
                  duration.addEventListener("change", () => {
                        this.stopPreview();
                        if (!Number.isFinite(duration.valueAsNumber) || duration.valueAsNumber <= 0) {
                              duration.value = String(step.durationMs);
                              return;
                        }
                        step.durationMs = duration.valueAsNumber;
                        this.studio._saveState();
                  });
                  const move = document.createElement("button");
                  move.type = "button";
                  move.textContent = "↑";
                  move.title = "Move step earlier";
                  move.disabled = index === 0;
                  move.addEventListener("click", () => {
                        const sequence = transformation.sequence!;
                        [sequence[index - 1], sequence[index]] = [sequence[index], sequence[index - 1]];
                        this.sync();
                        this.studio._saveState();
                  });
                  const remove = document.createElement("button");
                  remove.type = "button";
                  remove.textContent = "×";
                  remove.title = "Remove step";
                  remove.addEventListener("click", () => {
                        transformation.sequence!.splice(index, 1);
                        this.sync();
                        this.studio._saveState();
                  });
                  row.append(pose, duration, move, remove);
                  this.steps.append(row);
            });
      }

      stopPreview(): void {
            cancelAnimationFrame(this.previewFrame);
            this.previewFrame = 0;
      }

      private preview(): void {
            this.stopPreview();
            const transformation = this.studio._currentConfig().transformation;
            if (!transformation) return;
            const sequence = structuredClone(transformation.sequence ?? []);
            this.studio.activeForm = "transformed";
            this.studio._refreshForm();
            const start = performance.now();
            const tick = (now: number) => {
                  let elapsed = now - start;
                  let pose = "idle";
                  let running = false;
                  for (const step of sequence) {
                        if (elapsed < step.durationMs) {
                              pose = step.pose;
                              running = true;
                              break;
                        }
                        elapsed -= step.durationMs;
                  }
                  if (this.studio.activePoseKey !== pose) {
                        this.studio.activePoseKey = pose;
                        this.studio._populatePoseSelect(this.studio._currentConfig());
                        this.studio._onPoseChanged();
                  }
                  if (running) this.previewFrame = requestAnimationFrame(tick);
                  else this.previewFrame = 0;
            };
            this.previewFrame = requestAnimationFrame(tick);
      }
}
