import type { CharacterStudio } from "./studio-app";

export function installStudioControls(studio: CharacterStudio) {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((tab) => {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      });
      document
        .querySelectorAll(".tab-content")
        .forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      document
        .getElementById(`tab-${button.dataset.tab}`)
        ?.classList.add("active");
    });
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
      const syncToSlider = (eventName: "input" | "change") => () => {
        slider.value = numberInput.value;
        slider.dispatchEvent(new Event(eventName, { bubbles: true }));
      };
      numberInput.addEventListener("input", syncToSlider("input"));
      numberInput.addEventListener("change", syncToSlider("change"));
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
