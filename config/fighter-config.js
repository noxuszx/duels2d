(function () {
  "use strict";

  function clone(value) {
    if (value == null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(clone);

    var copy = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        copy[key] = clone(value[key]);
      }
    }
    return copy;
  }

  function merge(base, overrides) {
    var result = clone(base);
    if (!overrides) return result;

    for (var key in overrides) {
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;

      var value = overrides[key];
      var current = result[key];
      var isPlainObject =
        value != null && typeof value === "object" && !Array.isArray(value);
      var currentIsPlainObject =
        current != null && typeof current === "object" && !Array.isArray(current);

      result[key] = isPlainObject && currentIsPlainObject
        ? merge(current, value)
        : clone(value);
    }
    return result;
  }

  function composeFighter(definition) {
    var fighter = merge(window.FighterDefaults, definition);
    var combat = fighter.combat;
    var body = fighter.body;
    var presentation = fighter.presentation;

    return {
      id: fighter.id,
      name: fighter.name,
      color: fighter.color,

      maxHealth: combat.maxHealth,
      speed: combat.speed,
      baseDamage: combat.baseDamage,
      weapon: combat.weapon,
      faceTarget: combat.faceTarget,

      radius: body.radius,
      hitbox: body.hitbox,
      hitboxOffset: body.hitboxOffset,

      image: presentation.image,
      imageScale: presentation.imageScale,
      imageOffset: presentation.imageOffset,
      imageCrop: presentation.imageCrop,
      healthBarOffset: presentation.healthBarOffset,
      weaponScale: presentation.weaponScale,
      weaponOffset: presentation.weaponOffset,
      poses: presentation.poses,
      defaultFacing: presentation.defaultFacing,

      lines: fighter.lines,
    };
  }

  window.FighterRoster = window.FighterDefinitions.map(composeFighter);

  // Backward-compatible name used by code still being migrated to "fighter".
  window.CharacterConfigs = window.FighterRoster;
})();
