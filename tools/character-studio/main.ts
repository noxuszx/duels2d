import { loadFighterConfig } from "../../src/config/fighter-loader";
import { loadRuntimeConfig } from "../../src/config/runtime-config";
import { CharacterStudio } from "./studio-app";
import { installStudioControls } from "./studio-controls";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const [fighterConfig, runtimeConfig] = await Promise.all([
      loadFighterConfig("../../config/fighters"),
      loadRuntimeConfig("../../config"),
    ]);
    const studio = new CharacterStudio(
      fighterConfig.roster,
      fighterConfig.definitions,
      runtimeConfig.indicators,
      fighterConfig.defaults,
    );
    window.__studioInstance = studio;
    installStudioControls(studio);
  } catch (error) {
    console.error("Failed to start Character Studio:", error);
  }
});
