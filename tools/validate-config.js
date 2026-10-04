#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema } from "../src/config/schema-validator.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const fail = (location, message) => errors.push(`${location}: ${message}`);
const schema = read("config/fighters/fighter.schema.json");
const defaults = read("config/fighters/defaults.json");
const manifest = read("config/fighters/index.json");
const sounds = read("config/sound-manifest.json");
const game = read("config/game-settings.json");
errors.push(...validateSchema(defaults, schema.$defs.defaults, schema, "defaults"));

function asset(location, value) {
      if (typeof value !== "string" || !value || !fs.existsSync(path.join(root, value)))
            fail(location, `missing asset ${String(value)}`);
}
function poses(location, values) {
      for (const [name, pose] of Object.entries(values ?? {}))
            asset(`${location}.${name}`, typeof pose === "string" ? pose : pose.image);
}
function cue(location, name, fighterId) {
      if (name && !sounds.characters?.[fighterId]?.cues?.[name] && !sounds.shared?.[name])
            fail(location, `unknown sound cue ${String(name)}`);
}
function componentBank(location, components, moves, poseBank, fighterId, ids) {
      for (const [name, data] of Object.entries(components ?? {})) {
            for (const field of ["sound", "hitSound"]) cue(`${location}.${name}.${field}`, data[field], fighterId);
            for (const pose of [...(data.poses ?? []), ...(data.pose ? [data.pose] : [])])
                  if (!Object.hasOwn(poseBank ?? {}, pose)) fail(`${location}.${name}`, `unknown pose ${pose}`);
            if (name === "projectile") {
                  const image = data.projectile?.image;
                  for (const file of Array.isArray(image) ? image : image ? [image] : []) asset(`${location}.${name}.image`, file);
            }
            if (name === "saucer") {
                  if (data.image) asset(`${location}.${name}.image`, data.image);
                  if (!ids.has(data.summonConfigId)) fail(`${location}.${name}`, `unknown summon ${data.summonConfigId}`);
            }
      }
      for (const [name, move] of Object.entries(moves ?? {})) cue(`${location}.moves.${name}.windupSound`, move.windupSound, fighterId);
}

const files = manifest.fighters;
if (!Array.isArray(files) || files.length === 0) fail("fighters/index.json", "fighters must be a nonempty array");
const fileSet = new Set();
const definitions = [];
for (const file of Array.isArray(files) ? files : []) {
      if (typeof file !== "string" || path.basename(file) !== file || file.includes("\\") ||
            !file.endsWith(".json") || ["defaults.json", "fighter.schema.json", "index.json"].includes(file)) {
            fail("fighters/index.json", `invalid fighter filename ${String(file)}`); continue;
      }
      if (fileSet.has(file)) { fail("fighters/index.json", `duplicate file ${file}`); continue; }
      fileSet.add(file);
      try {
            const definition = read(`config/fighters/${file}`);
            const issues = validateSchema(definition, schema, schema, file);
            errors.push(...issues);
            if (definition.id !== file.slice(0, -5)) fail(file, "id must match filename");
            if (issues.length === 0) definitions.push(definition);
      } catch (error) { fail(file, error.message); }
}
const ids = new Set(definitions.map(definition => definition.id));
for (const definition of definitions) {
      const { id } = definition;
      const presentation = { ...defaults.presentation, ...definition.presentation };
      for (const key of ["image", "weaponIdle", "weaponAttack"]) if (presentation[key]) asset(`${id}.presentation.${key}`, presentation[key]);
      const poseBank = { ...defaults.presentation.poses, ...presentation.poses };
      poses(`${id}.poses`, poseBank);
      const components = { ...defaults.components, ...definition.components };
      const moves = { ...defaults.moves, ...definition.moves };
      componentBank(`${id}.components`, components, moves, poseBank, id, ids);
      for (const [name, form] of Object.entries(definition.forms ?? {})) {
            const formPoses = form.poses ?? poseBank;
            poses(`${id}.forms.${name}.poses`, formPoses);
            componentBank(`${id}.forms.${name}.components`, form.components ?? components,
                  form.moves ?? moves, formPoses, id, ids);
            for (const step of form.sequence ?? [])
                  if (!Object.hasOwn(formPoses, step.pose)) fail(`${id}.forms.${name}.sequence`, `unknown pose ${step.pose}`);
      }
}

for (const [fighterId, profile] of Object.entries({ shared: { cues: sounds.shared }, ...sounds.characters })) {
      for (const [name, sound] of Object.entries(profile.cues ?? {})) {
            const location = `sounds.${fighterId}.${name}`;
            if (!Object.hasOwn(game.audio.categories, sound.category)) fail(location, `unknown category ${sound.category}`);
            if (!Array.isArray(sound.clips) || !sound.clips.length) fail(location, "clips must be a nonempty array");
            for (const clip of sound.clips ?? []) asset(location, typeof clip === "string" ? clip : clip.path);
      }
}
if (errors.length) {
      console.error(`Configuration validation failed (${errors.length} errors):`);
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
} else {
      console.log(`Configuration valid: ${definitions.length} fighters; shared schema, forms, component references and assets checked.`);
}
