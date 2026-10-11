import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { studioDevSave } from "./tools/character-studio/persistence/dev-save-plugin.ts";

const SPRITE_FILE_PATTERN = /\.(?:png|jpe?g|webp|gif)$/i;

function listSpriteFiles(): string[] {
  const assetRoot = resolve("assets/fighters");
  const spriteFiles: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        SPRITE_FILE_PATTERN.test(entry.name) &&
        path.replaceAll("\\", "/").includes("/sprites/")
      ) {
        spriteFiles.push(relative(resolve("."), path).replaceAll("\\", "/"));
      }
    }
  };
  if (existsSync(assetRoot)) visit(assetRoot);
  return spriteFiles.sort((a, b) => a.localeCompare(b));
}

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
  define: {
    __SPRITE_CATALOG__: JSON.stringify(listSpriteFiles()),
  },
  plugins: [copyRuntimeFiles(), studioDevSave()],
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
