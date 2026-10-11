import { loadFighterConfig } from "../../src/config/fighter-loader";
import { loadRuntimeConfig } from "../../src/config/runtime-config";
import { CharacterStudio } from "./app/studio-app";
import { installStudioControls } from "./ui/studio-controls";
import { connectDevFiles } from "./persistence/dev-file-access";

window.addEventListener("DOMContentLoaded", async () => {
      try {
            const [fighterConfig, runtimeConfig, fileHandles] = await Promise.all([
                  loadFighterConfig("../../config/fighters"),
                  loadRuntimeConfig("../../config"),
                  connectDevFiles().catch((error: unknown) => {
                        console.error("Direct project saving unavailable:", error);
                        return new Map();
                  }),
            ]);
            const studio = new CharacterStudio(
                  fighterConfig.roster,
                  fighterConfig.definitions,
                  runtimeConfig.indicators,
                  fighterConfig.defaults,
                  fileHandles,
            );
            window.__studioInstance = studio;
            installStudioControls(studio);
      } catch (error) {
            console.error("Failed to start Character Studio:", error);
      }
});
