export interface StudioControlsHost {
      mode: "default" | "crop" | "hitbox";
      _draw(): void;
      undo(): void;
      redo(): void;
}

/** Refresh controls explicitly after a document or tool-state change. */
export function syncStudioControls(
      studio: Pick<StudioControlsHost, "mode">,
): void {
      document
            .querySelectorAll<HTMLInputElement>(".num-input")
            .forEach((input) => {
                  const slider = document.getElementById(
                        input.dataset.for ?? "",
                  ) as HTMLInputElement | null;
                  if (!slider || document.activeElement === input) return;
                  input.value = slider.value;
                  input.min = slider.min;
                  input.max = slider.max;
                  input.disabled = slider.disabled;
            });
      const badge = document.getElementById("mode-badge");
      if (badge) {
            badge.textContent =
                  studio.mode === "crop" ? "✂ CROP MODE" : "⬛ HITBOX MODE";
            badge.className =
                  studio.mode === "default"
                        ? "mode-badge hidden"
                        : `mode-badge ${studio.mode}`;
      }
}

export function installStudioControls(studio: StudioControlsHost) {
      const activatePanel = (tabName: string) => {
            document
                  .querySelectorAll<HTMLButtonElement>(".tab-btn")
                  .forEach((tab) => {
                        const active = tab.dataset.tab === tabName;
                        tab.classList.toggle("active", active);
                        tab.setAttribute("aria-selected", String(active));
                  });
            document
                  .querySelectorAll<HTMLElement>(".tab-content")
                  .forEach((panel) =>
                        panel.classList.toggle(
                              "active",
                              panel.id === `tab-${tabName}`,
                        ),
                  );
            document
                  .querySelectorAll<HTMLButtonElement>(".tool-btn")
                  .forEach((tool) =>
                        tool.classList.toggle(
                              "active",
                              tool.dataset.toolTab === tabName,
                        ),
                  );
            studio._draw();
            const context = document.getElementById("status-context");
            if (context)
                  context.textContent = `${tabName === "healthbar" ? "Health bar" : tabName} properties`;
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

      document
            .getElementById("undo-btn")
            ?.addEventListener("click", () => studio.undo());
      document
            .getElementById("redo-btn")
            ?.addEventListener("click", () => studio.redo());
      syncStudioControls(studio);
}
