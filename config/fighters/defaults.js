(function () {
  "use strict";

  window.FighterDefinitions = [];

  window.FighterDefaults = {
    combat: {
      maxHealth: 1000,
      speed: 10,
      baseDamage: 100,
      weapon: null,
      faceTarget: { mode: "never" },
    },
    body: {
      radius: 30,
      hitbox: { type: "box", width: 78, height: 112 },
      hitboxOffset: { x: 0, y: -15 },
    },
    presentation: {
      image: null,
      imageScale: 1,
      imageOffset: { x: 0, y: 0 },
      imageCrop: null,
      healthBarOffset: { x: 0, y: -76 },
      weaponScale: 1,
      weaponOffset: { x: 0, y: 0 },
      defaultFacing: "right",
      poses: null,
    },
    lines: {},
  };
})();
