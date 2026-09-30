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
            transformation: fighter.transformation
                  ? {
                          trigger: fighter.transformation.trigger,
                          sequence: fighter.transformation.sequence,
                          abilities:
                                fighter.transformation.combat?.abilities ??
                                fighter.combat.abilities,
                          poses:
                                fighter.transformation.presentation?.poses ??
                                fighter.presentation.poses,
                    }
                  : null,
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
const sounds = JSON.parse(
      fs.readFileSync(path.join(root, "config", "sound-manifest.json"), "utf8"),
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

function checkAim(location, aim) {
      if (!aim || typeof aim !== "object" || Array.isArray(aim)) {
            fail(location, "must be an aim skill object");
            return;
      }
      checkVector(`${location}.muzzle`, aim.muzzle);
      if (aim.pivot !== undefined) checkVector(`${location}.pivot`, aim.pivot);
      if (aim.forwardDegrees !== undefined && !Number.isFinite(aim.forwardDegrees))
            fail(`${location}.forwardDegrees`, "must be a finite number");
      for (const key of Object.keys(aim))
            if (!["muzzle", "pivot", "forwardDegrees"].includes(key))
                  fail(`${location}.${key}`, "unknown aim skill property");
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

function checkPoses(location, poses) {
      Object.entries(poses || {}).forEach(([name, pose]) => {
            const poseLocation = `${location}.${name}`;
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
            if (pose.imageScale !== undefined && !isPositive(pose.imageScale)) {
                  fail(`${poseLocation}.imageScale`, "must be greater than 0");
            }
            if (pose.imageOffset)
                  checkVector(`${poseLocation}.imageOffset`, pose.imageOffset);
            checkCrop(`${poseLocation}.imageCrop`, pose.imageCrop);
            if (pose.aim !== undefined) checkAim(`${poseLocation}.aim`, pose.aim);
      });
}

function checkAbilityTiming(location, timing) {
      if (!timing) return;
      ["windupMs", "activeMs", "recoveryMs"].forEach((field) => {
            if (!Number.isFinite(timing[field]) || timing[field] < 0) {
                  fail(
                        `${location}.${field}`,
                        "must be a non-negative number",
                  );
            }
      });
}

function checkVolume(location, value, max = 1) {
      if (!Number.isFinite(value) || value < 0 || value > max)
            fail(location, `must be between 0 and ${max}`);
}

function checkAbilities(location, fighterId, abilities) {
      if (!Array.isArray(abilities)) {
            fail(location, "abilities must be an array");
            return;
      }
      const abilityIds = new Set();
      abilities.forEach((ability, abilityIndex) => {
            const abilityLocation = `${location}[${abilityIndex}]`;
            if (typeof ability.id !== "string" || !ability.id) {
                  fail(abilityLocation, "id must be a non-empty string");
            } else if (abilityIds.has(ability.id)) {
                  fail(abilityLocation, `duplicate ability id: ${ability.id}`);
            }
            abilityIds.add(ability.id);
            if (!isPositive(ability.timing?.cooldownMs))
                  fail(abilityLocation, "timing.cooldownMs must be greater than 0");
            checkAbilityTiming(abilityLocation, ability.timing);
            if (!Array.isArray(ability.actions) || ability.actions.length === 0)
                  fail(abilityLocation, "actions must be a non-empty array");
            const attackHitboxes = (ability.actions || []).filter(
                  (action) => action.type === "attack-hitbox",
            );
            if (attackHitboxes.length > 1) {
                  fail(abilityLocation, "must not contain more than one attack-hitbox action");
            }

            const availableCues = new Set([
                  ...Object.keys(sounds.shared || {}),
                  ...Object.keys(sounds.characters?.[fighterId]?.cues || {}),
            ]);
            Object.entries(ability.audio || {}).forEach(([event, cue]) => {
                  if (!new Set(["windup", "active", "hit"]).has(event))
                        fail(`${abilityLocation}.audio.${event}`, "is not supported");
                  if (typeof cue !== "string" || !availableCues.has(cue))
                        fail(
                              `${abilityLocation}.audio.${event}`,
                              `references unknown sound cue: ${String(cue)}`,
                        );
            });

            (ability.actions || []).forEach((action, actionIndex) => {
                  const actionLocation = `${abilityLocation}.actions[${actionIndex}]`;
                  if (action.type === "attack-hitbox") {
                        if (!isPositive(action.width))
                              fail(`${actionLocation}.width`, "must be greater than 0");
                        if (!isPositive(action.height))
                              fail(`${actionLocation}.height`, "must be greater than 0");
                        checkVector(`${actionLocation}.offset`, action.offset);
                  }
                  if (action.type === "recoil" && !isPositive(action.forceMagnitude)) {
                        fail(`${actionLocation}.forceMagnitude`, "must be greater than 0");
                  }
                  if (action.type === "wall-crawl") {
                        if (!isPositive(action.durationMs))
                              fail(`${actionLocation}.durationMs`, "must be greater than 0");
                        if (!isPositive(action.speedMultiplier))
                              fail(`${actionLocation}.speedMultiplier`, "must be greater than 0");
                  }
                  if (action.type === "apply-status") {
                        if (!new Set(["stun", "ability-lock"]).has(action.effect))
                              fail(`${actionLocation}.effect`, "must be stun or ability-lock");
                        if (!isPositive(action.durationMs))
                              fail(`${actionLocation}.durationMs`, "must be greater than 0");
                  }
                  if (action.type !== "spawn-projectile") return;
                  const projectile = action.projectile;
                  const projectileLocation = `${actionLocation}.projectile`;
                  if (!isPositive(projectile?.speed))
                        fail(projectileLocation, "speed must be greater than 0");
                  if (!isPositive(projectile?.radius))
                        fail(projectileLocation, "radius must be greater than 0");
                  if (!isPositive(projectile?.lifetimeMs))
                        fail(projectileLocation, "lifetimeMs must be greater than 0");
                  const images = Array.isArray(projectile?.image)
                        ? projectile.image
                        : [projectile?.image];
                  images.forEach((imagePath, imageIndex) =>
                        checkAsset(
                              `${projectileLocation}.image${images.length > 1 ? `[${imageIndex}]` : ""}`,
                              imagePath,
                        ),
                  );
            });
      });
}

function checkSoundCue(location, cue) {
      if (!cue || typeof cue !== "object") {
            fail(location, "must be a cue object");
            return;
      }
      if (typeof cue.category !== "string" || !cue.category)
            fail(`${location}.category`, "must be a non-empty string");
      else if (game.audio?.categories?.[cue.category] === undefined)
            fail(
                  `${location}.category`,
                  `references unknown category: ${cue.category}`,
            );
      if (cue.volume !== undefined) checkVolume(`${location}.volume`, cue.volume, 5);
      if (
            cue.cooldownMs !== undefined &&
            (!Number.isFinite(cue.cooldownMs) || cue.cooldownMs < 0)
      )
            fail(`${location}.cooldownMs`, "must be 0 or greater");
      if (
            cue.intervalMs !== undefined &&
            (!Number.isFinite(cue.intervalMs) || cue.intervalMs < 0)
      )
            fail(`${location}.intervalMs`, "must be 0 or greater");
      if (
            cue.pitchVariation !== undefined &&
            typeof cue.pitchVariation !== "boolean"
      )
            fail(`${location}.pitchVariation`, "must be a boolean");
      if (!Array.isArray(cue.clips) || cue.clips.length === 0) {
            fail(`${location}.clips`, "must be a non-empty array");
            return;
      }
      cue.clips.forEach((clip, index) => {
            const clipPath = typeof clip === "string" ? clip : clip?.path;
            checkAsset(`${location}.clips[${index}]`, clipPath);
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
      if (definition.skills !== undefined) {
            if (!definition.skills || typeof definition.skills !== "object" || Array.isArray(definition.skills))
                  fail(`${location}.skills`, "must be a skills object");
            else {
                  for (const key of Object.keys(definition.skills))
                        if (key !== "aim") fail(`${location}.skills.${key}`, "unknown skill");
                  if (definition.skills.aim !== undefined)
                        checkAim(`${location}.skills.aim`, definition.skills.aim);
            }
      }
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
            checkPoses(`${location}.presentation.poses`, presentation.poses);
      }

      if (definition.transformation?.presentation?.poses) {
            checkPoses(
                  `${location}.transformation.presentation.poses`,
                  definition.transformation.presentation.poses,
            );
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
      checkAbilities(`${location}.abilities`, fighter.id, fighter.abilities);

      if (fighter.transformation) {
            const transformationLocation = `${location}.transformation`;
            const sequence = fighter.transformation.sequence;
            if (sequence !== undefined && !Array.isArray(sequence)) {
                  fail(`${transformationLocation}.sequence`, "must be an array");
            } else {
                  (sequence || []).forEach((step, index) => {
                        const stepLocation = `${transformationLocation}.sequence[${index}]`;
                        if (!isPositive(step?.durationMs))
                              fail(`${stepLocation}.durationMs`, "must be greater than 0");
                        if (typeof step?.pose !== "string" ||
                              !fighter.transformation.poses?.[step.pose])
                              fail(`${stepLocation}.pose`, "must reference a transformed pose");
                  });
            }
            if (fighter.transformation.trigger?.type !== "health-threshold") {
                  fail(
                        `${transformationLocation}.trigger.type`,
                        "must be health-threshold",
                  );
            }
            const ratio = fighter.transformation.trigger?.healthRatio;
            if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
                  fail(
                        `${transformationLocation}.trigger.healthRatio`,
                        "must be greater than 0 and no greater than 1",
                  );
            }
            Object.entries(fighter.transformation.poses || {}).forEach(
                  ([poseName, pose]) => {
                        const image = typeof pose === "string" ? pose : pose?.image;
                        if (image)
                              checkAsset(
                                    `${transformationLocation}.presentation.poses.${poseName}`,
                                    image,
                              );
                  },
            );
            checkAbilities(
                  `${transformationLocation}.abilities`,
                  fighter.id,
                  fighter.transformation.abilities,
            );
      }
});

const game = JSON.parse(
      fs.readFileSync(path.join(root, "config", "game-settings.json"), "utf8"),
);
checkVolume("game-settings.json.audio.masterVolume", game.audio?.masterVolume);
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
Object.entries(game.audio?.categories || {}).forEach(([name, volume]) =>
      checkVolume(`game-settings.json.audio.categories.${name}`, volume),
);

Object.entries(sounds.shared || {}).forEach(([cueName, cue]) =>
      checkSoundCue(`sound-manifest.json.shared.${cueName}`, cue),
);
Object.entries(sounds.characters || {}).forEach(([fighterId, profile]) => {
      if (profile?.volume !== undefined)
            checkVolume(
                  `sound-manifest.json.characters.${fighterId}.volume`,
                  profile.volume,
            );
      Object.entries(profile?.cues || {}).forEach(([cueName, cue]) =>
            checkSoundCue(
                  `sound-manifest.json.characters.${fighterId}.cues.${cueName}`,
                  cue,
            ),
      );
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
