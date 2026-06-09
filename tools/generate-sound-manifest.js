#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CHAR_DIR = path.join(ROOT, 'assets', 'characters');
const SFX_DIR = path.join(ROOT, 'assets', 'sfx');
const OUT_FILE = path.join(ROOT, 'config', 'sounds.js');
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

function sortedDirectories(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listAudioFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(file => AUDIO_EXTS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function buildManifest() {
  const manifest = { shared: {}, characters: {} };

  for (const soundType of sortedDirectories(SFX_DIR)) {
    const typeDir = path.join(SFX_DIR, soundType);
    const files = listAudioFiles(typeDir).map(file => `assets/sfx/${soundType}/${file}`);

    if (files.length > 0) manifest.shared[soundType] = files;
  }

  for (const characterId of sortedDirectories(CHAR_DIR)) {
    const soundsDir = path.join(CHAR_DIR, characterId, 'sounds');
    if (!fs.existsSync(soundsDir)) continue;

    const soundTypes = {};

    for (const soundType of sortedDirectories(soundsDir)) {
      const typeDir = path.join(soundsDir, soundType);
      const files = listAudioFiles(typeDir).map(file =>
        `assets/characters/${characterId}/sounds/${soundType}/${file}`
      );

      if (files.length > 0) soundTypes[soundType] = files;
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
  fs.writeFileSync(OUT_FILE, `window.SoundManifest = ${JSON.stringify(manifest, null, 2)};\n`);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main();
