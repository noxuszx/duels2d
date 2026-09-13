import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Copies runtime-addressed files which are deliberately kept as editable JSON/assets. */
function copyRuntimeFiles(): Plugin {
  const runtimeFiles = [
    "assets",
    "config/fighters",
    "config/game-settings.json",
    "config/indicator-settings.json",
    "config/sound-manifest.json",
  ];
  return {
    name: "duels2d-runtime-files",
    closeBundle() {
      const outputDirectory = resolve("dist");
      for (const runtimeFile of runtimeFiles) {
        const source = resolve(runtimeFile);
        if (!existsSync(source)) continue;
        const destination = resolve(outputDirectory, runtimeFile);
        mkdirSync(resolve(destination, ".."), { recursive: true });
        cpSync(source, destination, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyRuntimeFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        arena: resolve("index.html"),
        studio: resolve("tools/character-studio/index.html"),
      },
    },
  },
});
