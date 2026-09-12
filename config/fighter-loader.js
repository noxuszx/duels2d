(function () {
  "use strict";

  async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  window.loadFighterConfig = async function (fightersPath) {
    const basePath = fightersPath.replace(/\/$/, "");
    const [defaults, manifest] = await Promise.all([
      loadJson(`${basePath}/defaults.json`),
      loadJson(`${basePath}/index.json`),
    ]);

    if (!Array.isArray(manifest.fighters)) {
      throw new Error(`${basePath}/index.json must contain a fighters array`);
    }

    const files = new Set();
    manifest.fighters.forEach((file) => {
      if (
        typeof file !== "string" ||
        file.includes("/") ||
        file.includes("\\") ||
        !file.endsWith(".json") ||
        file === "defaults.json" ||
        file === "fighter.schema.json"
      ) {
        throw new Error(`Invalid fighter filename in ${basePath}/index.json: ${String(file)}`);
      }
      if (files.has(file)) {
        throw new Error(`Duplicate fighter filename in ${basePath}/index.json: ${file}`);
      }
      files.add(file);
    });

    window.FighterDefaults = defaults;
    window.FighterDefinitions = await Promise.all(
      manifest.fighters.map((file) => loadJson(`${basePath}/${file}`)),
    );
    const ids = new Set();
    window.FighterDefinitions.forEach((fighter, index) => {
      const file = manifest.fighters[index];
      if (file.slice(0, -5) !== fighter.id) {
        throw new Error(`${file} must contain the matching fighter id "${file.slice(0, -5)}"`);
      }
      if (ids.has(fighter.id)) throw new Error(`Duplicate fighter id: ${fighter.id}`);
      ids.add(fighter.id);
    });
    window.buildFighterRoster();
    return window.FighterRoster;
  };
})();
