#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const fightersDir = path.join(root, "config", "fighters");
const errors = [];

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}

function checkAsset(location, assetPath) {
  if (typeof assetPath !== "string" || assetPath.length === 0) {
    fail(location, "must be a non-empty asset path");
    return;
  }
  if (!fs.existsSync(path.join(root, assetPath))) {
    fail(location, `asset does not exist: ${assetPath}`);
  }
}

global.window = {};
require(path.join(fightersDir, "defaults.js"));

const fighterFiles = fs.readdirSync(fightersDir)
  .filter((file) => file.endsWith(".js") && file !== "defaults.js")
  .sort();

fighterFiles.forEach((file) => require(path.join(fightersDir, file)));
require(path.join(root, "config", "fighter-config.js"));
require(path.join(root, "config", "game-settings.js"));

const definitions = window.FighterDefinitions;
const roster = window.FighterRoster;
const ids = new Set();
const faceModes = new Set(["never", "always", "range"]);
const weaponTypes = new Set(["projectile", "proximity-melee"]);

if (definitions.length < 2) {
  fail("config/fighters", "at least two fighters are required to start a match");
}

definitions.forEach((definition, index) => {
  const location = fighterFiles[index] || `fighter #${index + 1}`;
  if (!/^[a-z0-9-]+$/.test(definition.id || "")) {
    fail(location, "id must contain only lowercase letters, numbers, and hyphens");
  } else if (ids.has(definition.id)) {
    fail(location, `duplicate fighter id: ${definition.id}`);
  }
  ids.add(definition.id);

  if (typeof definition.name !== "string" || definition.name.trim() === "") {
    fail(location, "name is required");
  }
  if (!/^#[0-9a-f]{6}$/i.test(definition.color || "")) {
    fail(location, "color must be a six-digit hex color such as #ffd84d");
  }
});

roster.forEach((fighter) => {
  const location = `fighter ${fighter.id}`;
  if (!isPositive(fighter.maxHealth)) fail(location, "maxHealth must be greater than 0");
  if (!isPositive(fighter.speed)) fail(location, "speed must be greater than 0");
  if (!Number.isFinite(fighter.baseDamage) || fighter.baseDamage < 0) {
    fail(location, "baseDamage must be 0 or greater");
  }
  if (!isPositive(fighter.radius)) fail(location, "radius must be greater than 0");
  if (!faceModes.has(fighter.faceTarget?.mode)) {
    fail(location, "faceTarget.mode must be never, always, or range");
  }

  checkAsset(`${location}.presentation.image`, fighter.image);
  Object.entries(fighter.poses || {}).forEach(([poseName, pose]) => {
    const image = typeof pose === "string" ? pose : pose?.image;
    if (image) checkAsset(`${location}.presentation.poses.${poseName}`, image);
  });

  const weapon = fighter.weapon;
  if (!weapon) return;
  if (!weaponTypes.has(weapon.type)) {
    fail(location, `unsupported weapon type: ${weapon.type}`);
  }
  if (!isPositive(weapon.cooldownMs)) {
    fail(location, "weapon.cooldownMs must be greater than 0");
  }
  if (weapon.type === "projectile") {
    if (!weapon.projectile) {
      fail(location, "projectile weapon requires a projectile block");
    } else {
      if (!isPositive(weapon.projectile.speed)) fail(location, "projectile.speed must be greater than 0");
      if (!isPositive(weapon.projectile.radius)) fail(location, "projectile.radius must be greater than 0");
      checkAsset(`${location}.combat.weapon.projectile.image`, weapon.projectile.image);
    }
  }
});

const game = window.GameConfig;
if (!isPositive(game.physics?.globalSpeedMultiplier)) {
  fail("game-settings.js", "physics.globalSpeedMultiplier must be greater than 0");
}
if (!Number.isFinite(game.physics?.collisionCooldownMs) || game.physics.collisionCooldownMs < 0) {
  fail("game-settings.js", "physics.collisionCooldownMs must be 0 or greater");
}
Object.entries(game.audio?.volumes || {}).forEach(([name, volume]) => {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    fail("game-settings.js", `audio.volumes.${name} must be between 0 and 1`);
  }
});

if (errors.length > 0) {
  console.error(`Configuration validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Configuration valid: ${roster.length} fighters, ${fighterFiles.length} fighter files.`);
}
