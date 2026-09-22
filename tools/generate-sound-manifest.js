#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SFX_SHARED_DIR = path.join(ROOT, "assets", "sfx", "shared");
const SFX_FIGHTER_DIR = path.join(ROOT, "assets", "sfx", "characters");
const OUT_FILE = path.join(ROOT, "config", "sound-manifest.json");
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

function sortedDirectories(dir) {
      if (!fs.existsSync(dir)) return [];

      return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));
}

function listAudioFiles(dir) {
      if (!fs.existsSync(dir)) return [];

      return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((file) => AUDIO_EXTS.has(path.extname(file).toLowerCase()))
            .sort((a, b) => a.localeCompare(b));
}

function toCamelCase(value) {
      return value.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function stripExt(file) {
      return path.parse(file).name;
}

function readExistingManifest() {
      if (!fs.existsSync(OUT_FILE)) return { shared: {}, characters: {} };
      return JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
}

function defaultCategory(cueName) {
      if (cueName === "victory") return "ui";
      if (cueName === "hurt" || cueName === "ambient" || cueName === "idle")
            return "voice";
      if (cueName === "body-bounce" || cueName === "weaponSlap")
            return "impact";
      if (cueName === "attackWindup") return "movement";
      return "weapon";
}

function buildCue(existingCue, cueName, clips) {
      const settings =
            existingCue && !Array.isArray(existingCue)
                  ? Object.fromEntries(
                          Object.entries(existingCue).filter(
                                ([key]) => key !== "clips",
                          ),
                    )
                  : {};
      return {
            category: settings.category ?? defaultCategory(cueName),
            ...settings,
            clips,
      };
}

function buildManifest() {
      const existing = readExistingManifest();
      const manifest = { shared: {}, characters: {} };

      for (const soundType of sortedDirectories(SFX_SHARED_DIR)) {
            const typeDir = path.join(SFX_SHARED_DIR, soundType);
            const files = listAudioFiles(typeDir).map((file) => ({
                  id: stripExt(file),
                  path: `assets/sfx/shared/${soundType}/${file}`,
            }));

            if (files.length > 0)
                  manifest.shared[soundType] = buildCue(
                        existing.shared?.[soundType],
                        soundType,
                        files,
                  );
      }

      for (const fighterId of sortedDirectories(SFX_FIGHTER_DIR)) {
            const fighterDir = path.join(SFX_FIGHTER_DIR, fighterId);
            const cues = {};

            for (const soundType of sortedDirectories(fighterDir)) {
                  const typeDir = path.join(fighterDir, soundType);
                  const files = listAudioFiles(typeDir).map((file) => ({
                        id: stripExt(file),
                        path: `assets/sfx/characters/${fighterId}/${soundType}/${file}`,
                  }));

                  if (files.length > 0) {
                        const cueName = toCamelCase(soundType);
                        cues[cueName] = buildCue(
                              existing.characters?.[fighterId]?.cues?.[
                                    cueName
                              ],
                              cueName,
                              files,
                        );
                  }
            }

            if (Object.keys(cues).length > 0) {
                  manifest.characters[fighterId] = {
                        volume:
                              existing.characters?.[fighterId]?.volume ?? 1,
                        cues,
                  };
            }
      }

      if (Object.keys(manifest.shared).length === 0) {
            delete manifest.shared;
      }

      return manifest;
}

function main() {
      const manifest = buildManifest();
      fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
      fs.writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main();
