import type { CharacterStudio } from "./studio-app";

export function installStudioControls(studio: CharacterStudio) {
      const activatePanel = (tabName: string) => {
            document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((tab) => {
                  const active = tab.dataset.tab === tabName;
                  tab.classList.toggle("active", active);
                  tab.setAttribute("aria-selected", String(active));
            });
            document.querySelectorAll<HTMLElement>(".tab-content").forEach((panel) =>
                  panel.classList.toggle("active", panel.id === `tab-${tabName}`),
            );
            document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((tool) =>
                  tool.classList.toggle("active", tool.dataset.toolTab === tabName),
            );
            studio._draw();
            const context = document.getElementById("status-context");
            if (context) context.textContent = `${tabName === "healthbar" ? "Health bar" : tabName} properties`;
      };

      document
            .querySelectorAll<HTMLButtonElement>(".tab-btn")
            .forEach((button) => {
                  button.addEventListener("click", () =>
                        activatePanel(button.dataset.tab ?? "hitbox"),
                  );
            });

      document
            .querySelectorAll<HTMLButtonElement>(".tool-btn")
            .forEach((button) => {
                  button.addEventListener("click", () =>
                        activatePanel(button.dataset.toolTab ?? "hitbox"),
                  );
            });

      const seedNumberInputs = () => {
            document
                  .querySelectorAll<HTMLInputElement>(".num-input")
                  .forEach((numberInput) => {
                        const slider = document.getElementById(
                              numberInput.dataset.for ?? "",
                        ) as HTMLInputElement | null;
                        if (slider) numberInput.value = slider.value;
                  });
      };

      document
            .querySelectorAll<HTMLInputElement>(".num-input")
            .forEach((numberInput) => {
                  const slider = document.getElementById(
                        numberInput.dataset.for ?? "",
                  ) as HTMLInputElement | null;
                  if (!slider) return;
                  const syncToSlider =
                        (eventName: "input" | "change") => () => {
                              slider.value = numberInput.value;
                              slider.dispatchEvent(
                                    new Event(eventName, { bubbles: true }),
                              );
                        };
                  numberInput.addEventListener("input", syncToSlider("input"));
                  numberInput.addEventListener(
                        "change",
                        syncToSlider("change"),
                  );
                  slider.addEventListener("input", () => {
                        numberInput.value = slider.value;
                  });
                  slider.addEventListener("change", () => {
                        numberInput.value = slider.value;
                  });
                  numberInput.value = slider.value;
            });

      const originalRefresh = studio._refreshLabels.bind(studio);
      studio._refreshLabels = () => {
            originalRefresh();
            seedNumberInputs();
      };

      const badge = document.getElementById("mode-badge");
      const updateBadge = () => {
            if (!badge) return;
            if (studio.mode === "crop") {
                  badge.textContent = "✂ CROP MODE";
                  badge.className = "mode-badge crop";
            } else if (studio.mode === "hitbox") {
                  badge.textContent = "⬛ HITBOX MODE";
                  badge.className = "mode-badge hitbox";
            } else {
                  badge.className = "mode-badge hidden";
            }
      };

      (
            [
                  "_enterCropMode",
                  "_applyCrop",
                  "_cancelCrop",
                  "_enterHitboxMode",
                  "_applyHitbox",
                  "_cancelHitbox",
                  "_loadCurrentConfig",
            ] as const
      ).forEach((methodName) => {
            const original = studio[methodName].bind(studio);
            studio[methodName] = () => {
                  const result = original();
                  updateBadge();
                  return result;
            };
      });

      document
            .getElementById("undo-btn")
            ?.addEventListener("click", () => studio.undo());
      document
            .getElementById("redo-btn")
            ?.addEventListener("click", () => studio.redo());
      seedNumberInputs();
}
