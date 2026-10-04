import type { FighterComponents, MoveConfig } from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";
import { requireElement } from "../ui/dom";
import { poseLabel } from "../document/pose-label";
import { createForm, type StudioForm } from "../document/form-model";
import { assertComponentData } from "../../../src/config/validation";

export { poseBank, createForm, type StudioForm } from "../document/form-model";

export interface FormHost {
      activeForm: StudioForm;
      activePoseKey: string;
      _currentConfig(): StudioConfig;
      _refreshForm(): void;
      _saveState(): void;
      _populatePoseSelect(config: StudioConfig): void;
      _onPoseChanged(): void;
}

export function parseComponents(text: string): FighterComponents {
      const value: unknown = JSON.parse(text);
      assertComponentData(value, {});
      return value as FighterComponents;
}
export function parseMoves(text: string): Record<string, MoveConfig> {
      const value: unknown = JSON.parse(text);
      assertComponentData({}, value);
      return value as Record<string, MoveConfig>;
}

/** Edits named forms and their presentation sequence; behavior scripts choose when to use a form. */
export class FormTool {
      private form = requireElement<HTMLSelectElement>("form-select");
      private formName = requireElement<HTMLInputElement>("form-name");
      private threshold = requireElement<HTMLInputElement>("form-health-ratio");
      private steps = requireElement<HTMLElement>("form-steps");
      private components = requireElement<HTMLTextAreaElement>("components-json");
      private moves = requireElement<HTMLTextAreaElement>("moves-json");
      private error = requireElement<HTMLElement>("config-json-error");
      private previewFrame = 0;

      constructor(private studio: FormHost) {
            this.form.addEventListener("change", () => {
                  this.stopPreview();
                  studio.activeForm = this.form.value;
                  studio._refreshForm();
            });
            requireElement("add-form").addEventListener("click", () => {
                  const name = this.formName.value.trim();
                  const config = studio._currentConfig();
                  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) || name === "base" || name in config.forms) {
                        this.error.textContent = "Enter a unique form name starting with a letter.";
                        return;
                  }
                  config.forms[name] = createForm(config);
                  studio.activeForm = name;
                  this.formName.value = "";
                  studio._refreshForm();
                  studio._saveState();
            });
            requireElement("remove-form").addEventListener("click", () => {
                  if (studio.activeForm === "base") return;
                  delete studio._currentConfig().forms[studio.activeForm];
                  studio.activeForm = "base";
                  studio._refreshForm();
                  studio._saveState();
            });
            this.threshold.addEventListener("change", () => {
                  const form = studio._currentConfig().forms[studio.activeForm];
                  if (!form) return;
                  const value = this.threshold.valueAsNumber;
                  if (this.threshold.value.trim() === "") delete form.healthRatio;
                  else if (Number.isFinite(value) && value > 0 && value <= 1) form.healthRatio = value;
                  else { this.sync(); return; }
                  studio._saveState();
            });
            requireElement("apply-config-json").addEventListener("click", () => {
                  try {
                        const components = parseComponents(this.components.value);
                        const moves = parseMoves(this.moves.value);
                        assertComponentData(components, moves);
                        const config = studio._currentConfig();
                        if (studio.activeForm === "base") {
                              config.components = components;
                              config.moves = moves;
                        } else {
                              const form = config.forms[studio.activeForm];
                              if (!form) throw new Error("Choose an existing form.");
                              form.components = components;
                              form.moves = moves;
                        }
                        this.error.textContent = "";
                        studio._refreshForm();
                        studio._saveState();
                  } catch (error) {
                        this.error.textContent = error instanceof Error ? error.message : "Invalid JSON.";
                  }
            });
            requireElement("add-form-step").addEventListener("click", () => {
                  const form = studio._currentConfig().forms[studio.activeForm];
                  const pose = Object.keys(form?.poses ?? {})[0];
                  if (!form || !pose) return;
                  (form.sequence ??= []).push({ pose, durationMs: 600 });
                  this.sync();
                  studio._saveState();
            });
            requireElement("preview-form").addEventListener("click", () => this.preview());
      }

      sync(): void {
            this.stopPreview();
            const config = this.studio._currentConfig();
            const selected = config.forms[this.studio.activeForm];
            if (this.studio.activeForm !== "base" && !selected) this.studio.activeForm = "base";
            this.form.replaceChildren(new Option("Base", "base"));
            for (const name of Object.keys(config.forms)) this.form.add(new Option(name, name));
            this.form.value = this.studio.activeForm;
            requireElement<HTMLButtonElement>("remove-form").disabled = this.studio.activeForm === "base";
            const form = config.forms[this.studio.activeForm];
            this.threshold.disabled = !form;
            this.threshold.value = form?.healthRatio === undefined ? "" : String(form.healthRatio);
            this.components.value = JSON.stringify(form?.components ?? config.components, null, 2);
            this.moves.value = JSON.stringify(form?.moves ?? config.moves, null, 2);
            this.error.textContent = "";
            this.steps.replaceChildren();
            const poses = Object.keys(form?.poses ?? {});
            requireElement<HTMLButtonElement>("add-form-step").disabled = !poses.length;
            form?.sequence?.forEach((step, index) => {
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
                        const sequence = form.sequence!;
                        [sequence[index - 1], sequence[index]] = [sequence[index], sequence[index - 1]];
                        this.sync();
                        this.studio._saveState();
                  });
                  const remove = document.createElement("button");
                  remove.type = "button";
                  remove.textContent = "×";
                  remove.title = "Remove step";
                  remove.addEventListener("click", () => {
                        form.sequence!.splice(index, 1);
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
            const form = this.studio._currentConfig().forms[this.studio.activeForm];
            if (!form) return;
            const sequence = structuredClone(form.sequence ?? []);
            const start = performance.now();
            const tick = (now: number) => {
                  let elapsed = now - start;
                  let pose = "idle";
                  let running = false;
                  for (const step of sequence) {
                        if (elapsed < step.durationMs) { pose = step.pose; running = true; break; }
                        elapsed -= step.durationMs;
                  }
                  if (this.studio.activePoseKey !== pose) {
                        this.studio.activePoseKey = pose;
                        this.studio._populatePoseSelect(this.studio._currentConfig());
                        this.studio._onPoseChanged();
                  }
                  this.previewFrame = running ? requestAnimationFrame(tick) : 0;
            };
            this.previewFrame = requestAnimationFrame(tick);
      }
}
