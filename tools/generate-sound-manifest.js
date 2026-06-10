#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SFX_DIR = path.join(ROOT, "assets", "sfx");
const SFX_CHAR_DIR = path.join(SFX_DIR, "characters");
const OUT_FILE = path.join(ROOT, "config", "sounds.js");
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

function buildManifest() {
  const manifest = { shared: {}, characters: {} };

  for (const soundType of sortedDirectories(SFX_DIR)) {
    if (soundType === "characters") continue;

    const typeDir = path.join(SFX_DIR, soundType);
    const files = listAudioFiles(typeDir).map(
      (file) => `assets/sfx/${soundType}/${file}`,
    );

    if (files.length > 0) manifest.shared[soundType] = files;
  }

  for (const characterId of sortedDirectories(SFX_CHAR_DIR)) {
    const characterDir = path.join(SFX_CHAR_DIR, characterId);
    const soundTypes = {};

    for (const soundType of sortedDirectories(characterDir)) {
      const typeDir = path.join(characterDir, soundType);
      const files = listAudioFiles(typeDir).map(
        (file) => `assets/sfx/characters/${characterId}/${soundType}/${file}`,
      );

      if (files.length > 0) soundTypes[toCamelCase(soundType)] = files;
    }

    if (Object.keys(soundTypes).length > 0) {
      manifest.characters[characterId] = soundTypes;
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
  fs.writeFileSync(
    OUT_FILE,
    `window.SoundManifest = ${JSON.stringify(manifest, null, 2)};\n`,
  );
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main();
