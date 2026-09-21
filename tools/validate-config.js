#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function clone(value) {
      if (value == null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(clone);
      return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, clone(item)]),
      );
}

function merge(base, overrides) {
      const result = clone(base);
      if (!overrides) return result;
      for (const [key, value] of Object.entries(overrides)) {
            const current = result[key];
            const plainValue =
                  value != null &&
                  typeof value === "object" &&
                  !Array.isArray(value);
            const plainCurrent =
                  current != null &&
                  typeof current === "object" &&
                  !Array.isArray(current);
            result[key] =
                  plainValue && plainCurrent
                        ? merge(current, value)
                        : clone(value);
      }
      return result;
}

function composeFighter(defaults, definition) {
      const fighter = merge(defaults, definition);
      return {
            id: fighter.id,
            name: fighter.name,
            color: fighter.color,
            maxHealth: fighter.combat.maxHealth,
            speed: fighter.combat.speed,
            baseDamage: fighter.combat.baseDamage,
            abilities: fighter.combat.abilities,
            faceTarget: fighter.combat.faceTarget,
            radius: fighter.body.radius,
            hitbox: fighter.body.hitbox,
            hitboxOffset: fighter.body.hitboxOffset,
            image: fighter.presentation.image,
            imageScale: fighter.presentation.imageScale,
            imageOffset: fighter.presentation.imageOffset,
            imageCrop: fighter.presentation.imageCrop,
            healthBarOffset: fighter.presentation.healthBarOffset,
            weaponScale: fighter.presentation.weaponScale,
            weaponOffset: fighter.presentation.weaponOffset,
            weaponPivot: fighter.presentation.weaponPivot,
            weaponIdle: fighter.presentation.weaponIdle,
            weaponAttack: fighter.presentation.weaponAttack,
            poses: fighter.presentation.poses,
            defaultFacing: fighter.presentation.defaultFacing,
            lines: fighter.lines,
      };
}

const defaults = JSON.parse(
      fs.readFileSync(path.join(fightersDir, "defaults.json"), "utf8"),
);

const manifest = JSON.parse(
      fs.readFileSync(path.join(fightersDir, "index.json"), "utf8"),
);
const fighterFiles = manifest.fighters;
if (!Array.isArray(fighterFiles) || fighterFiles.length === 0) {
      console.error(
            "config/fighters/index.json: fighters must be a non-empty array",
      );
      process.exit(1);
}

const manifestEntries = new Set();
fighterFiles.forEach((file) => {
      if (
            typeof file !== "string" ||
            path.basename(file) !== file ||
            !file.endsWith(".json") ||
            file === "defaults.json" ||
            file === "fighter.schema.json"
      ) {
            fail(
                  "config/fighters/index.json",
                  `invalid fighter filename: ${String(file)}`,
            );
      } else if (manifestEntries.has(file)) {
            fail(
                  "config/fighters/index.json",
                  `duplicate fighter filename: ${file}`,
            );
      }
      manifestEntries.add(file);
});

if (errors.length > 0) {
      errors.forEach((error) => console.error(`- ${error}`));
      process.exit(1);
}

const definitions = fighterFiles.map((file) =>
      JSON.parse(fs.readFileSync(path.join(fightersDir, file), "utf8")),
);
const roster = definitions.map((definition) =>
      composeFighter(defaults, definition),
);

const ids = new Set();
const faceModes = new Set(["never", "always", "range"]);
const facingDirections = new Set(["left", "right"]);

function checkVector(location, value) {
      if (
            !value ||
            typeof value !== "object" ||
            !Number.isFinite(value.x) ||
            !Number.isFinite(value.y)
      ) {
            fail(location, "must contain finite numeric x and y values");
      }
}

function checkCrop(location, crop) {
      if (crop == null) return;
      if (!Number.isFinite(crop.x) || crop.x < 0)
            fail(location, "x must be 0 or greater");
      if (!Number.isFinite(crop.y) || crop.y < 0)
            fail(location, "y must be 0 or greater");
      if (!isPositive(crop.width))
            fail(location, "width must be greater than 0");
      if (!isPositive(crop.height))
            fail(location, "height must be greater than 0");
}

function checkAnimation(location, animation) {
      if (!animation) return;
      ["windupFrames", "activeFrames", "recoveryFrames"].forEach((field) => {
            if (!Number.isInteger(animation[field]) || animation[field] < 0) {
                  fail(
                        `${location}.${field}`,
                        "must be a non-negative integer",
                  );
            }
      });
}

if (definitions.length < 2) {
      fail(
            "config/fighters",
            "at least two fighters are required to start a match",
      );
}

definitions.forEach((definition, index) => {
      const location = fighterFiles[index] || `fighter #${index + 1}`;
      if (!/^[a-z0-9-]+$/.test(definition.id || "")) {
            fail(
                  location,
                  "id must contain only lowercase letters, numbers, and hyphens",
            );
      } else if (ids.has(definition.id)) {
            fail(location, `duplicate fighter id: ${definition.id}`);
      }
      ids.add(definition.id);

      if (path.basename(location, ".json") !== definition.id) {
            fail(
                  location,
                  `filename must match fighter id (${definition.id}.json)`,
            );
      }

      if (
            typeof definition.name !== "string" ||
            definition.name.trim() === ""
      ) {
            fail(location, "name is required");
      }
      if (!/^#[0-9a-f]{6}$/i.test(definition.color || "")) {
            fail(
                  location,
                  "color must be a six-digit hex color such as #ffd84d",
            );
      }

      const presentation = definition.presentation;
      if (presentation) {
            if (
                  presentation.imageScale !== undefined &&
                  !isPositive(presentation.imageScale)
            ) {
                  fail(
                        `${location}.presentation.imageScale`,
                        "must be greater than 0",
                  );
            }
            if (
                  presentation.weaponScale !== undefined &&
                  !isPositive(presentation.weaponScale)
            ) {
                  fail(
                        `${location}.presentation.weaponScale`,
                        "must be greater than 0",
                  );
            }
            if (presentation.imageOffset)
                  checkVector(
                        `${location}.presentation.imageOffset`,
                        presentation.imageOffset,
                  );
            if (presentation.healthBarOffset)
                  checkVector(
                        `${location}.presentation.healthBarOffset`,
                        presentation.healthBarOffset,
                  );
            if (presentation.weaponOffset)
                  checkVector(
                        `${location}.presentation.weaponOffset`,
                        presentation.weaponOffset,
                  );
            if (presentation.weaponPivot)
                  checkVector(
                        `${location}.presentation.weaponPivot`,
                        presentation.weaponPivot,
                  );
            checkCrop(
                  `${location}.presentation.imageCrop`,
                  presentation.imageCrop,
            );
            if (
                  presentation.defaultFacing !== undefined &&
                  !facingDirections.has(presentation.defaultFacing)
            ) {
                  fail(
                        `${location}.presentation.defaultFacing`,
                        "must be left or right",
                  );
            }
            Object.entries(presentation.poses || {}).forEach(([name, pose]) => {
                  const poseLocation = `${location}.presentation.poses.${name}`;
                  if (typeof pose === "string") {
                        if (!pose) fail(poseLocation, "must not be empty");
                        return;
                  }
                  if (!pose || typeof pose.image !== "string" || !pose.image) {
                        fail(
                              poseLocation,
                              "must be an asset path or an object with an image path",
                        );
                        return;
                  }
                  if (
                        pose.imageScale !== undefined &&
                        !isPositive(pose.imageScale)
                  ) {
                        fail(
                              `${poseLocation}.imageScale`,
                              "must be greater than 0",
                        );
                  }
                  if (pose.imageOffset)
                        checkVector(
                              `${poseLocation}.imageOffset`,
                              pose.imageOffset,
                        );
                  checkCrop(`${poseLocation}.imageCrop`, pose.imageCrop);
            });
      }

      const lines = definition.lines || {};
      Object.entries(lines).forEach(([name, value]) => {
            if (name === "ambientIntervalMs") {
                  if (!isPositive(value))
                        fail(
                              `${location}.lines.${name}`,
                              "must be greater than 0",
                        );
            } else if (name === "ambientChance") {
                  if (!Number.isFinite(value) || value < 0 || value > 1) {
                        fail(
                              `${location}.lines.${name}`,
                              "must be between 0 and 1",
                        );
                  }
            } else if (
                  !Array.isArray(value) ||
                  value.some((line) => typeof line !== "string" || !line.trim())
            ) {
                  fail(
                        `${location}.lines.${name}`,
                        "must be an array of non-empty strings",
                  );
            }
      });
});

roster.forEach((fighter) => {
      const location = `fighter ${fighter.id}`;
      if (!isPositive(fighter.maxHealth))
            fail(location, "maxHealth must be greater than 0");
      if (!isPositive(fighter.speed))
            fail(location, "speed must be greater than 0");
      if (!Number.isFinite(fighter.baseDamage) || fighter.baseDamage < 0) {
            fail(location, "baseDamage must be 0 or greater");
      }
      if (!isPositive(fighter.radius))
            fail(location, "radius must be greater than 0");
      if (!faceModes.has(fighter.faceTarget?.mode)) {
            fail(location, "faceTarget.mode must be never, always, or range");
      }
      if (!facingDirections.has(fighter.defaultFacing)) {
            fail(location, "defaultFacing must be left or right");
      }

      const hitbox = fighter.hitbox;
      if (hitbox?.type === "box") {
            if (!isPositive(hitbox.width))
                  fail(location, "hitbox.width must be greater than 0");
            if (!isPositive(hitbox.height))
                  fail(location, "hitbox.height must be greater than 0");
      } else if (hitbox?.type === "circle") {
            if (!isPositive(hitbox.radius))
                  fail(location, "hitbox.radius must be greater than 0");
      } else {
            fail(location, "hitbox.type must be box or circle");
      }
      checkVector(`${location}.hitboxOffset`, fighter.hitboxOffset);

      checkAsset(`${location}.presentation.image`, fighter.image);
      Object.entries(fighter.poses || {}).forEach(([poseName, pose]) => {
            const image = typeof pose === "string" ? pose : pose?.image;
            if (image)
                  checkAsset(
                        `${location}.presentation.poses.${poseName}`,
                        image,
                  );
      });

      if (!Array.isArray(fighter.abilities)) {
            fail(location, "abilities must be an array");
            return;
      }
      const abilityIds = new Set();
      fighter.abilities.forEach((ability, abilityIndex) => {
            const abilityLocation = `${location}.abilities[${abilityIndex}]`;
            if (typeof ability.id !== "string" || !ability.id) {
                  fail(abilityLocation, "id must be a non-empty string");
            } else if (abilityIds.has(ability.id)) {
                  fail(abilityLocation, `duplicate ability id: ${ability.id}`);
            }
            abilityIds.add(ability.id);
            if (!isPositive(ability.timing?.cooldownMs))
                  fail(abilityLocation, "timing.cooldownMs must be greater than 0");
            checkAnimation(abilityLocation, ability.timing);
            if (!Array.isArray(ability.actions) || ability.actions.length === 0)
                  fail(abilityLocation, "actions must be a non-empty array");

            (ability.actions || []).forEach((action, actionIndex) => {
                  if (action.type !== "spawn-projectile") return;
                  const projectile = action.projectile;
                  const actionLocation = `${abilityLocation}.actions[${actionIndex}].projectile`;
                  if (!isPositive(projectile?.speed))
                        fail(actionLocation, "speed must be greater than 0");
                  if (!isPositive(projectile?.radius))
                        fail(actionLocation, "radius must be greater than 0");
                  if (!isPositive(projectile?.lifetimeMs))
                        fail(actionLocation, "lifetimeMs must be greater than 0");
                  const images = Array.isArray(projectile?.image)
                        ? projectile.image
                        : [projectile?.image];
                  images.forEach((imagePath, imageIndex) =>
                        checkAsset(
                              `${actionLocation}.image${images.length > 1 ? `[${imageIndex}]` : ""}`,
                              imagePath,
                        ),
                  );
            });
      });
});

const game = JSON.parse(
      fs.readFileSync(path.join(root, "config", "game-settings.json"), "utf8"),
);
if (
      !isPositive(game.rendering?.scale) ||
      game.rendering.scale > 4
) {
      fail(
            "game-settings.json",
            "rendering.scale must be greater than 0 and no greater than 4",
      );
}
if (!isPositive(game.physics?.globalSpeedMultiplier)) {
      fail(
            "game-settings.json",
            "physics.globalSpeedMultiplier must be greater than 0",
      );
}
if (
      !Number.isFinite(game.physics?.collisionCooldownMs) ||
      game.physics.collisionCooldownMs < 0
) {
      fail(
            "game-settings.json",
            "physics.collisionCooldownMs must be 0 or greater",
      );
}
Object.entries(game.audio?.volumes || {}).forEach(([name, volume]) => {
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            fail(
                  "game-settings.json",
                  `audio.volumes.${name} must be between 0 and 1`,
            );
      }
});

if (errors.length > 0) {
      console.error(
            `Configuration validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`,
      );
      errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
} else {
      console.log(
            `Configuration valid: ${roster.length} fighters, ${fighterFiles.length} fighter files.`,
      );
}
